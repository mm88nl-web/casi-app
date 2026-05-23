//! CASI Escrow Program
//!
//! Follows the audited SPL escrow template from solana-developers/program-examples
//! (tokens/escrow/anchor) — uses `anchor_spl::token_interface` for Token-2022
//! compatibility, `transfer_checked` for all SPL transfers, `InterfaceAccount`
//! for token accounts and mints, and `has_one` constraints for relationship checks.
//!
//! Two escrow types:
//!   Flash — viewer locks USDC; streamer approves (funds released) or denies (refund).
//!   Beam  — viewer locks USDC; streamer starts a time-stream; anyone settles with
//!           integer proration after the duration elapses.
//!
//! Generic reusable primitive: the deployer calls `initialize_config` once to set
//! the accepted mint, per-escrow cap, and admin key. Each independent deployment
//! (different program ID) owns its own config. CASI ships a reference deployment;
//! other teams fork and deploy their own copy.

use anchor_lang::{prelude::*, solana_program::bpf_loader_upgradeable};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
        TransferChecked,
    },
};

declare_id!("CDunHmMe2KW8qmjoqWanuu3p1DsEYjqRA1yVmyXDtakM");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// PDA seed prefix for all CASI escrow state accounts.
pub const ESCROW_SEED: &[u8] = b"casi-escrow";

/// PDA seed prefix for per-streamer delegate accounts.
pub const DELEGATE_SEED: &[u8] = b"casi-delegate";

/// PDA seed for the single global config account (one per deployment).
pub const CONFIG_SEED: &[u8] = b"casi-config";

/// Current on-chain layout version for EscrowState. Every handler verifies
/// this; legacy accounts (pre-versioning) fail to deserialize because the
/// account size changed, and any future account that somehow has a lower
/// version is rejected explicitly.
pub const ESCROW_STATE_VERSION: u8 = 1;

/// Current on-chain layout version for StreamerDelegate.
pub const STREAMER_DELEGATE_VERSION: u8 = 1;

/// Current on-chain layout version for GlobalConfig.
pub const GLOBAL_CONFIG_VERSION: u8 = 1;

/// Maximum lifetime for a session-key delegate. Caps the damage if a session
/// key is ever compromised — the streamer can always revoke manually, but an
/// unrevoked delegate self-expires after this window. 180 days strikes the
/// "set it and forget it" UX balance without making the delegate de-facto
/// permanent.
pub const MAX_DELEGATE_LIFETIME_SECS: i64 = 180 * 24 * 60 * 60;

/// How long a Pending escrow must sit unclaimed before anyone can crank a
/// permissionless cancel on the viewer's behalf. Matches the reconciler's
/// worldview: if the streamer hasn't started after a week, the viewer's USDC
/// shouldn't be hostage to an offline wallet.
pub const PENDING_TIMEOUT_SECS: i64 = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

#[program]
pub mod casi_escrow {
    use super::*;

    // -----------------------------------------------------------------------
    // Global config
    // -----------------------------------------------------------------------

    /// One-time deployment initializer. Sets the accepted token mint, the
    /// per-escrow cap, and the admin key. Uses `init` (not `init_if_needed`)
    /// so it can only succeed once — calling it a second time always fails
    /// with AccountAlreadyInitialized, preventing re-initialization attacks.
    ///
    /// `accepted_mint` is stored but not updatable after init. If a different
    /// mint is ever required, deploy a new program. Immutability here prevents
    /// an admin key compromise from switching the mint out from under live
    /// escrows.
    ///
    /// `max_escrow_amount` — 0 means no cap (unlimited). Updatable by admin
    /// via `update_config` so it can be tightened or loosened for a capped
    /// launch without redeploying.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        accepted_mint: Pubkey,
        max_escrow_amount: u64,
    ) -> Result<()> {
        // Verify that `initializer` is the upgrade authority for this program.
        // ProgramData is bincode-serialized by the BPF Upgradeable Loader:
        //   [0..4]  variant index u32 LE (3 = ProgramData)
        //   [4..12] slot u64 LE
        //   [12]    Option tag (1 = Some, 0 = None)
        //   [13..45] upgrade_authority_address: [u8; 32]  (when tag == 1)
        // This prevents a front-runner from locking in a rogue accepted_mint
        // between deploy and the operator's initialize_config call.
        {
            let data = ctx.accounts.program_data.data.borrow();
            require!(data.len() >= 45, CasiError::Unauthorized);
            let variant = u32::from_le_bytes(
                data[0..4].try_into().map_err(|_| error!(CasiError::Unauthorized))?,
            );
            require!(variant == 3, CasiError::Unauthorized); // 3 = ProgramData
            require!(data[12] == 1, CasiError::Unauthorized); // Some(_)
            let authority = Pubkey::from(
                <[u8; 32]>::try_from(&data[13..45])
                    .map_err(|_| error!(CasiError::Unauthorized))?,
            );
            require!(authority == ctx.accounts.initializer.key(), CasiError::Unauthorized);
        }

        require!(
            accepted_mint != Pubkey::default(),
            CasiError::InvalidMint
        );

        ctx.accounts.config.set_inner(GlobalConfig {
            version:            GLOBAL_CONFIG_VERSION,
            admin:              ctx.accounts.initializer.key(),
            accepted_mint,
            paused:             false,
            max_escrow_amount,
            bump:               ctx.bumps.config,
        });

        emit!(ConfigInitialized {
            admin:              ctx.accounts.initializer.key(),
            accepted_mint,
            max_escrow_amount,
        });

        Ok(())
    }

    /// Admin-only: flip the pause flag and/or adjust the per-escrow cap.
    ///
    /// Pause only gates `initialize_escrow` — new escrows cannot be created
    /// while paused. Existing escrows are NOT affected: viewers and streamers
    /// can always settle, cancel, or approve regardless of the pause state.
    /// This prevents a pause from trapping funds.
    ///
    /// `accepted_mint` is intentionally NOT updatable here. Changing the
    /// accepted mint after escrows are live could create an inconsistency
    /// between what was locked (old mint) and what downstream code expects
    /// (new mint). Deploy a new program instead.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        paused: bool,
        max_escrow_amount: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.config.version == GLOBAL_CONFIG_VERSION,
            CasiError::UnsupportedVersion
        );

        ctx.accounts.config.paused             = paused;
        ctx.accounts.config.max_escrow_amount  = max_escrow_amount;

        emit!(ConfigUpdated {
            paused,
            max_escrow_amount,
        });

        Ok(())
    }

    /// Admin-only: transfer admin rights to a new key.
    ///
    /// Two-step is NOT enforced on-chain — the admin is responsible for
    /// confirming the new address is correct before calling this. Setting
    /// admin to `Pubkey::default()` (the zero address) is rejected because
    /// it would permanently brick `update_config` and `transfer_admin`.
    pub fn transfer_admin(
        ctx: Context<TransferAdmin>,
        new_admin: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.config.version == GLOBAL_CONFIG_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            new_admin != Pubkey::default(),
            CasiError::InvalidAdmin
        );

        ctx.accounts.config.admin = new_admin;

        emit!(AdminTransferred {
            old_admin: ctx.accounts.admin.key(),
            new_admin,
        });

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Escrow lifecycle
    // -----------------------------------------------------------------------

    /// Viewer locks tokens into a PDA-owned vault ATA.
    ///
    /// * `escrow_id`       — 32-byte UUID; used as PDA seed and stored for signing.
    /// * `amount`          — token micro-units (e.g. 6 decimals for USDC; 1 USDC = 1_000_000).
    /// * `duration_secs`   — 0 for Flash, > 0 for Beam.
    /// * `escrow_type_val` — 0 = Flash, 1 = Beam.
    ///
    /// Gated by GlobalConfig: fails if paused, if the mint doesn't match the
    /// configured accepted mint, or if the amount exceeds the per-escrow cap.
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        escrow_id: [u8; 32],
        amount: u64,
        duration_secs: u64,
        escrow_type_val: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.config.version == GLOBAL_CONFIG_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(!ctx.accounts.config.paused, CasiError::ProtocolPaused);
        require!(amount > 0, CasiError::InvalidAmount);

        if ctx.accounts.config.max_escrow_amount > 0 {
            require!(
                amount <= ctx.accounts.config.max_escrow_amount,
                CasiError::AmountExceedsCap
            );
        }

        let etype = EscrowType::from_u8(escrow_type_val)?;
        match etype {
            EscrowType::Beam  => require!(duration_secs > 0,  CasiError::InvalidDuration),
            EscrowType::Flash => require!(duration_secs == 0, CasiError::FlashMustHaveZeroDuration),
        }

        ctx.accounts.escrow_state.set_inner(EscrowState {
            escrow_id,
            viewer:          ctx.accounts.viewer.key(),
            streamer:        ctx.accounts.streamer.key(),
            usdc_mint:       ctx.accounts.usdc_mint.key(),
            total_amount:    amount,
            duration_secs,
            escrow_type:     etype,
            status:          EscrowStatus::Pending,
            start_timestamp: 0,
            bump:            ctx.bumps.escrow_state,
            version:         ESCROW_STATE_VERSION,
            created_at:      Clock::get()?.unix_timestamp,
        });

        transfer_tokens(
            &ctx.accounts.viewer_ata,
            &ctx.accounts.vault,
            amount,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.viewer,
            &ctx.accounts.token_program,
        )?;

        emit!(EscrowInitialized {
            escrow_id,
            viewer:          ctx.accounts.viewer.key(),
            streamer:        ctx.accounts.streamer.key(),
            amount,
            escrow_type_val,
        });

        Ok(())
    }

    /// Streamer approves a Flash: full amount → streamer ATA.
    /// Vault + EscrowState are closed; rent returned to viewer (the original
    /// rent payer at `initialize_escrow`).
    pub fn approve_flash(
        ctx: Context<ApproveFlash>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Flash,
            CasiError::WrongEscrowType
        );

        ctx.accounts.escrow_state.status = EscrowStatus::Settled;

        let total = ctx.accounts.escrow_state.total_amount;
        let bump  = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        pda_transfer_checked(
            &ctx.accounts.vault,
            &ctx.accounts.streamer_ata,
            total,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.viewer.to_account_info(),
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        emit!(FlashSettled {
            escrow_id,
            streamer_amount: total,
            approved: true,
        });

        Ok(())
    }

    /// Streamer denies a Flash: full refund to viewer.
    /// Vault + EscrowState are closed; rent returned to viewer.
    pub fn deny_flash(
        ctx: Context<DenyFlash>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Flash,
            CasiError::WrongEscrowType
        );

        ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

        let total = ctx.accounts.escrow_state.total_amount;
        let bump  = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        pda_transfer_checked(
            &ctx.accounts.vault,
            &ctx.accounts.viewer_ata,
            total,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.viewer.to_account_info(),
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        emit!(FlashSettled {
            escrow_id,
            streamer_amount: 0,
            approved: false,
        });

        Ok(())
    }

    /// Viewer cancels a pending Flash or Beam before the streamer acts.
    /// Full refund; vault + EscrowState closed; rent returned to viewer.
    pub fn cancel_escrow(
        ctx: Context<CancelEscrow>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );

        ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

        let total = ctx.accounts.escrow_state.total_amount;
        let bump  = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        pda_transfer_checked(
            &ctx.accounts.vault,
            &ctx.accounts.viewer_ata,
            total,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.viewer.to_account_info(),
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        Ok(())
    }

    /// Streamer starts a Beam: records `start_timestamp`, sets status → Active.
    pub fn start_beam(
        ctx: Context<StartBeam>,
        _escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Beam,
            CasiError::WrongEscrowType
        );

        ctx.accounts.escrow_state.status = EscrowStatus::Active;
        ctx.accounts.escrow_state.start_timestamp = Clock::get()?.unix_timestamp;

        emit!(BeamStarted {
            escrow_id: ctx.accounts.escrow_state.escrow_id,
            streamer:  ctx.accounts.streamer.key(),
            start_timestamp: ctx.accounts.escrow_state.start_timestamp,
            delegated: false,
        });

        Ok(())
    }

    /// Session-key path for starting a Beam. Identical effect to `start_beam`
    /// except the signer is a pre-authorized delegate instead of the streamer
    /// themselves.
    pub fn start_beam_delegated(
        ctx: Context<StartBeamDelegated>,
        _escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.delegate.version == STREAMER_DELEGATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Beam,
            CasiError::WrongEscrowType
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now < ctx.accounts.delegate.expires_at,
            CasiError::DelegateExpired
        );

        ctx.accounts.escrow_state.status = EscrowStatus::Active;
        ctx.accounts.escrow_state.start_timestamp = now;

        emit!(BeamStarted {
            escrow_id: ctx.accounts.escrow_state.escrow_id,
            streamer:  ctx.accounts.escrow_state.streamer,
            start_timestamp: now,
            delegated: true,
        });

        Ok(())
    }

    /// Beam settlement with pro-rata vesting.
    ///
    /// * Before `duration` elapses: only `streamer` or `viewer` may call.
    /// * After `duration` elapses: permissionless (anyone may crank).
    ///
    /// Integer proration: vested = total × min(elapsed, duration) / duration.
    pub fn settle_beam(
        ctx: Context<SettleBeam>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Active,
            CasiError::NotActive
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Beam,
            CasiError::WrongEscrowType
        );

        let now      = Clock::get()?.unix_timestamp;
        let start_ts = ctx.accounts.escrow_state.start_timestamp;
        let elapsed  = now.saturating_sub(start_ts).max(0) as u64;
        let duration = ctx.accounts.escrow_state.duration_secs;
        let total    = ctx.accounts.escrow_state.total_amount;
        let bump     = ctx.accounts.escrow_state.bump;

        require!(duration > 0, CasiError::InvalidDuration);

        // Before duration elapses, only the two consenting parties may settle.
        let caller_key = ctx.accounts.caller.key();
        let is_party   = caller_key == ctx.accounts.escrow_state.streamer
                      || caller_key == ctx.accounts.escrow_state.viewer;
        require!(is_party || elapsed >= duration, CasiError::Unauthorized);

        let vested_ticks = elapsed.min(duration);
        let streamer_amt = ((total as u128) * (vested_ticks as u128) / (duration as u128)) as u64;
        let refund       = total.checked_sub(streamer_amt).ok_or(CasiError::MathOverflow)?;

        ctx.accounts.escrow_state.status = EscrowStatus::Settled;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        if streamer_amt > 0 {
            pda_transfer_checked(
                &ctx.accounts.vault,
                &ctx.accounts.streamer_ata,
                streamer_amt,
                &ctx.accounts.usdc_mint,
                &ctx.accounts.escrow_state.to_account_info(),
                &ctx.accounts.token_program,
                signer,
            )?;
        }

        if refund > 0 {
            pda_transfer_checked(
                &ctx.accounts.vault,
                &ctx.accounts.viewer_ata,
                refund,
                &ctx.accounts.usdc_mint,
                &ctx.accounts.escrow_state.to_account_info(),
                &ctx.accounts.token_program,
                signer,
            )?;
        }

        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.viewer.to_account_info(),
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        emit!(BeamSettled {
            escrow_id,
            streamer_amount: streamer_amt,
            viewer_refund: refund,
        });

        Ok(())
    }

    /// Session-key path for early-ending a Beam. Identical effect to
    /// `settle_beam` but authorized via a delegate PDA instead of the
    /// streamer's wallet.
    pub fn settle_beam_delegated(
        ctx: Context<SettleBeamDelegated>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.delegate.version == STREAMER_DELEGATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Active,
            CasiError::NotActive
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Beam,
            CasiError::WrongEscrowType
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now < ctx.accounts.delegate.expires_at,
            CasiError::DelegateExpired
        );

        let start_ts = ctx.accounts.escrow_state.start_timestamp;
        let elapsed  = now.saturating_sub(start_ts).max(0) as u64;
        let duration = ctx.accounts.escrow_state.duration_secs;
        let total    = ctx.accounts.escrow_state.total_amount;
        let bump     = ctx.accounts.escrow_state.bump;

        require!(duration > 0, CasiError::InvalidDuration);

        let vested_ticks = elapsed.min(duration);
        let streamer_amt = ((total as u128) * (vested_ticks as u128) / (duration as u128)) as u64;
        let refund       = total.checked_sub(streamer_amt).ok_or(CasiError::MathOverflow)?;

        ctx.accounts.escrow_state.status = EscrowStatus::Settled;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        if streamer_amt > 0 {
            pda_transfer_checked(
                &ctx.accounts.vault,
                &ctx.accounts.streamer_ata,
                streamer_amt,
                &ctx.accounts.usdc_mint,
                &ctx.accounts.escrow_state.to_account_info(),
                &ctx.accounts.token_program,
                signer,
            )?;
        }

        if refund > 0 {
            pda_transfer_checked(
                &ctx.accounts.vault,
                &ctx.accounts.viewer_ata,
                refund,
                &ctx.accounts.usdc_mint,
                &ctx.accounts.escrow_state.to_account_info(),
                &ctx.accounts.token_program,
                signer,
            )?;
        }

        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.viewer.to_account_info(),
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        emit!(BeamSettled {
            escrow_id,
            streamer_amount: streamer_amt,
            viewer_refund: refund,
        });

        Ok(())
    }

    /// Delegated Flash approval. Same effect as `approve_flash`, signed by
    /// the session key.
    pub fn approve_flash_delegated(
        ctx: Context<ApproveFlashDelegated>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.delegate.version == STREAMER_DELEGATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Flash,
            CasiError::WrongEscrowType
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now < ctx.accounts.delegate.expires_at,
            CasiError::DelegateExpired
        );

        ctx.accounts.escrow_state.status = EscrowStatus::Settled;

        let total = ctx.accounts.escrow_state.total_amount;
        let bump  = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        pda_transfer_checked(
            &ctx.accounts.vault,
            &ctx.accounts.streamer_ata,
            total,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.viewer.to_account_info(),
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        emit!(FlashSettled {
            escrow_id,
            streamer_amount: total,
            approved: true,
        });

        Ok(())
    }

    /// Delegated Flash denial. Same effect as `deny_flash`, signed by the
    /// session key.
    pub fn deny_flash_delegated(
        ctx: Context<DenyFlashDelegated>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.delegate.version == STREAMER_DELEGATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Flash,
            CasiError::WrongEscrowType
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now < ctx.accounts.delegate.expires_at,
            CasiError::DelegateExpired
        );

        ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

        let total = ctx.accounts.escrow_state.total_amount;
        let bump  = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        pda_transfer_checked(
            &ctx.accounts.vault,
            &ctx.accounts.viewer_ata,
            total,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.viewer.to_account_info(),
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        emit!(FlashSettled {
            escrow_id,
            streamer_amount: 0,
            approved: false,
        });

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Session-key delegation
    // -----------------------------------------------------------------------

    /// Install or rotate a session-key delegate for a streamer.
    ///
    /// Re-calling overwrites the session_key / expires_at in-place (rotation).
    pub fn set_delegate(
        ctx: Context<SetDelegate>,
        session_key: Pubkey,
        expires_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(expires_at > now, CasiError::InvalidExpiry);
        require!(
            expires_at <= now.saturating_add(MAX_DELEGATE_LIFETIME_SECS),
            CasiError::DelegateLifetimeExceedsMax
        );

        ctx.accounts.delegate.set_inner(StreamerDelegate {
            version:     STREAMER_DELEGATE_VERSION,
            streamer:    ctx.accounts.streamer.key(),
            session_key,
            expires_at,
            bump:        ctx.bumps.delegate,
        });

        emit!(DelegateInstalled {
            streamer: ctx.accounts.streamer.key(),
            session_key,
            expires_at,
        });

        Ok(())
    }

    /// Streamer revokes their session-key delegate. The PDA closes and rent
    /// refunds to the streamer.
    pub fn revoke_delegate(ctx: Context<RevokeDelegate>) -> Result<()> {
        require!(
            ctx.accounts.delegate.version == STREAMER_DELEGATE_VERSION,
            CasiError::UnsupportedVersion
        );
        emit!(DelegateRevoked {
            streamer: ctx.accounts.streamer.key(),
        });
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Permissionless stale-pending cancel
    // -----------------------------------------------------------------------

    /// Permissionless refund for a Pending escrow that has sat untouched past
    /// `PENDING_TIMEOUT_SECS` since creation. Anyone can crank this.
    /// The refund destination is forced to `viewer_ata` so a cranker cannot
    /// redirect funds.
    pub fn cancel_stale_pending(
        ctx: Context<CancelStalePending>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.escrow_state.version == ESCROW_STATE_VERSION,
            CasiError::UnsupportedVersion
        );
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );

        let now = Clock::get()?.unix_timestamp;
        let age = now.saturating_sub(ctx.accounts.escrow_state.created_at);
        require!(age >= PENDING_TIMEOUT_SECS, CasiError::PendingNotStale);

        ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

        let total = ctx.accounts.escrow_state.total_amount;
        let bump  = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        pda_transfer_checked(
            &ctx.accounts.vault,
            &ctx.accounts.viewer_ata,
            total,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.viewer.to_account_info(),
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        emit!(StalePendingCancelled {
            escrow_id,
            age_secs: age,
        });

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn transfer_tokens<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &Signer<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    let accounts = TransferChecked {
        from:      from.to_account_info(),
        mint:      mint.to_account_info(),
        to:        to.to_account_info(),
        authority: authority.to_account_info(),
    };
    transfer_checked(
        CpiContext::new(token_program.to_account_info(), accounts),
        amount,
        mint.decimals,
    )
}

fn pda_transfer_checked<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let accounts = TransferChecked {
        from:      from.to_account_info(),
        mint:      mint.to_account_info(),
        to:        to.to_account_info(),
        authority: authority.clone(),
    };
    transfer_checked(
        CpiContext::new_with_signer(token_program.to_account_info(), accounts, signer_seeds),
        amount,
        mint.decimals,
    )
}

fn pda_close_account<'info>(
    account: &InterfaceAccount<'info, TokenAccount>,
    destination: AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let accounts = CloseAccount {
        account:     account.to_account_info(),
        destination,
        authority:   authority.clone(),
    };
    close_account(
        CpiContext::new_with_signer(token_program.to_account_info(), accounts, signer_seeds),
    )
}

// ---------------------------------------------------------------------------
// Account Contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,

    /// `init` (not `init_if_needed`) makes this instruction callable exactly
    /// once. A second call always fails with AccountAlreadyInitialized.
    #[account(
        init,
        payer  = initializer,
        space  = 8 + GlobalConfig::INIT_SPACE,
        seeds  = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    /// This program's ProgramData account, owned by the BPF Upgradeable Loader.
    /// Required so the instruction handler can verify that `initializer` is the
    /// current upgrade authority, preventing front-running between deploy and
    /// the first `initialize_config` call.
    ///
    /// CHECK: owner is the BPF Upgradeable Loader; PDA seeds verify it belongs
    ///        to this program. Upgrade-authority check happens in the handler.
    #[account(
        owner = bpf_loader_upgradeable::ID,
        seeds = [crate::ID.as_ref()],
        seeds::program = bpf_loader_upgradeable::ID,
    )]
    pub program_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds   = [CONFIG_SEED],
        bump    = config.bump,
        has_one = admin @ CasiError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds   = [CONFIG_SEED],
        bump    = config.bump,
        has_one = admin @ CasiError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub viewer: Signer<'info>,

    /// CHECK: Streamer wallet — stored in EscrowState, verified on settle/deny.
    pub streamer: UncheckedAccount<'info>,

    /// Global config is read to enforce: not paused, correct mint, amount cap.
    #[account(
        seeds = [CONFIG_SEED],
        bump  = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer  = viewer,
        space  = 8 + EscrowState::INIT_SPACE,
        seeds  = [ESCROW_SEED, escrow_id.as_ref()],
        bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        init,
        payer  = viewer,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = viewer,
        associated_token::token_program = token_program,
    )]
    pub viewer_ata: InterfaceAccount<'info, TokenAccount>,

    /// Must equal `config.accepted_mint`. Enforced in the instruction body
    /// rather than as an inline constraint so the error is `InvalidMint`
    /// rather than a generic account mismatch.
    #[account(
        mint::token_program = token_program,
        constraint = usdc_mint.key() == config.accepted_mint @ CasiError::InvalidMint,
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct ApproveFlash<'info> {
    #[account(mut)]
    pub streamer: Signer<'info>,

    /// CHECK: Receives the vault ATA + EscrowState rent on close. Bound to
    /// the escrow's `viewer` field via `has_one`.
    #[account(mut)]
    pub viewer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds    = [ESCROW_SEED, escrow_id.as_ref()],
        bump     = escrow_state.bump,
        has_one  = streamer  @ CasiError::Unauthorized,
        has_one  = viewer    @ CasiError::Unauthorized,
        has_one  = usdc_mint @ CasiError::InvalidMint,
        close    = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = streamer,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = streamer,
        associated_token::token_program = token_program,
    )]
    pub streamer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct DenyFlash<'info> {
    #[account(mut)]
    pub streamer: Signer<'info>,

    #[account(mut)]
    pub viewer: SystemAccount<'info>,

    #[account(
        mut,
        seeds   = [ESCROW_SEED, escrow_id.as_ref()],
        bump    = escrow_state.bump,
        has_one = streamer  @ CasiError::Unauthorized,
        has_one = viewer    @ CasiError::Unauthorized,
        has_one = usdc_mint @ CasiError::InvalidMint,
        close   = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = streamer,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = viewer,
        associated_token::token_program = token_program,
    )]
    pub viewer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct CancelEscrow<'info> {
    #[account(mut)]
    pub viewer: Signer<'info>,

    #[account(
        mut,
        seeds   = [ESCROW_SEED, escrow_id.as_ref()],
        bump    = escrow_state.bump,
        has_one = viewer    @ CasiError::Unauthorized,
        has_one = usdc_mint @ CasiError::InvalidMint,
        close   = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = viewer,
        associated_token::token_program = token_program,
    )]
    pub viewer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(_escrow_id: [u8; 32])]
pub struct StartBeam<'info> {
    pub streamer: Signer<'info>,

    #[account(
        mut,
        seeds   = [ESCROW_SEED, _escrow_id.as_ref()],
        bump    = escrow_state.bump,
        has_one = streamer @ CasiError::Unauthorized,
    )]
    pub escrow_state: Account<'info, EscrowState>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct SettleBeam<'info> {
    /// CHECK: Any signer may trigger settlement once the Beam is Active.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut)]
    pub streamer: SystemAccount<'info>,

    #[account(mut)]
    pub viewer: SystemAccount<'info>,

    #[account(
        mut,
        seeds   = [ESCROW_SEED, escrow_id.as_ref()],
        bump    = escrow_state.bump,
        has_one = streamer  @ CasiError::Unauthorized,
        has_one = viewer    @ CasiError::Unauthorized,
        has_one = usdc_mint @ CasiError::InvalidMint,
        close   = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = caller,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = streamer,
        associated_token::token_program = token_program,
    )]
    pub streamer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = caller,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = viewer,
        associated_token::token_program = token_program,
    )]
    pub viewer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetDelegate<'info> {
    #[account(mut)]
    pub streamer: Signer<'info>,

    #[account(
        init_if_needed,
        payer  = streamer,
        space  = 8 + StreamerDelegate::INIT_SPACE,
        seeds  = [DELEGATE_SEED, streamer.key().as_ref()],
        bump,
    )]
    pub delegate: Account<'info, StreamerDelegate>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeDelegate<'info> {
    #[account(mut)]
    pub streamer: Signer<'info>,

    #[account(
        mut,
        seeds   = [DELEGATE_SEED, streamer.key().as_ref()],
        bump    = delegate.bump,
        has_one = streamer @ CasiError::Unauthorized,
        close   = streamer,
    )]
    pub delegate: Account<'info, StreamerDelegate>,
}

#[derive(Accounts)]
#[instruction(_escrow_id: [u8; 32])]
pub struct StartBeamDelegated<'info> {
    pub session: Signer<'info>,

    /// CHECK: Identifies the streamer whose delegate this is. Constraints
    /// below bind this key to both the delegate PDA seed and the escrow's
    /// own `streamer` field, preventing cross-streamer abuse.
    pub streamer: UncheckedAccount<'info>,

    #[account(
        seeds = [DELEGATE_SEED, streamer.key().as_ref()],
        bump  = delegate.bump,
        constraint = delegate.streamer    == streamer.key()   @ CasiError::Unauthorized,
        constraint = delegate.session_key == session.key()    @ CasiError::Unauthorized,
    )]
    pub delegate: Account<'info, StreamerDelegate>,

    #[account(
        mut,
        seeds = [ESCROW_SEED, _escrow_id.as_ref()],
        bump  = escrow_state.bump,
        constraint = escrow_state.streamer == streamer.key() @ CasiError::Unauthorized,
    )]
    pub escrow_state: Account<'info, EscrowState>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct SettleBeamDelegated<'info> {
    pub session: Signer<'info>,

    #[account(mut)]
    pub cranker: Signer<'info>,

    /// CHECK: Receives streamer_amt. Bound to escrow's `streamer` via `has_one`.
    #[account(mut)]
    pub streamer: SystemAccount<'info>,

    /// CHECK: Receives refund + rent. Bound to escrow's `viewer` via `has_one`.
    #[account(mut)]
    pub viewer: SystemAccount<'info>,

    #[account(
        seeds = [DELEGATE_SEED, streamer.key().as_ref()],
        bump  = delegate.bump,
        constraint = delegate.streamer    == streamer.key()   @ CasiError::Unauthorized,
        constraint = delegate.session_key == session.key()    @ CasiError::Unauthorized,
    )]
    pub delegate: Account<'info, StreamerDelegate>,

    #[account(
        mut,
        seeds   = [ESCROW_SEED, escrow_id.as_ref()],
        bump    = escrow_state.bump,
        has_one = streamer  @ CasiError::Unauthorized,
        has_one = viewer    @ CasiError::Unauthorized,
        has_one = usdc_mint @ CasiError::InvalidMint,
        close   = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = cranker,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = streamer,
        associated_token::token_program = token_program,
    )]
    pub streamer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = cranker,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = viewer,
        associated_token::token_program = token_program,
    )]
    pub viewer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct ApproveFlashDelegated<'info> {
    pub session: Signer<'info>,

    #[account(mut)]
    pub cranker: Signer<'info>,

    /// CHECK: Receives the full escrowed tokens. Bound via `has_one`.
    #[account(mut)]
    pub streamer: SystemAccount<'info>,

    /// CHECK: Receives vault ATA + EscrowState rent. Bound via `has_one`.
    #[account(mut)]
    pub viewer: UncheckedAccount<'info>,

    #[account(
        seeds = [DELEGATE_SEED, streamer.key().as_ref()],
        bump  = delegate.bump,
        constraint = delegate.streamer    == streamer.key() @ CasiError::Unauthorized,
        constraint = delegate.session_key == session.key()  @ CasiError::Unauthorized,
    )]
    pub delegate: Account<'info, StreamerDelegate>,

    #[account(
        mut,
        seeds    = [ESCROW_SEED, escrow_id.as_ref()],
        bump     = escrow_state.bump,
        has_one  = streamer  @ CasiError::Unauthorized,
        has_one  = viewer    @ CasiError::Unauthorized,
        has_one  = usdc_mint @ CasiError::InvalidMint,
        close    = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = cranker,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = streamer,
        associated_token::token_program = token_program,
    )]
    pub streamer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct DenyFlashDelegated<'info> {
    pub session: Signer<'info>,

    #[account(mut)]
    pub cranker: Signer<'info>,

    /// CHECK: Delegate-PDA seed anchor. Not a funds destination.
    pub streamer: SystemAccount<'info>,

    /// CHECK: Refund + rent destination. Bound via `has_one`.
    #[account(mut)]
    pub viewer: SystemAccount<'info>,

    #[account(
        seeds = [DELEGATE_SEED, streamer.key().as_ref()],
        bump  = delegate.bump,
        constraint = delegate.streamer    == streamer.key() @ CasiError::Unauthorized,
        constraint = delegate.session_key == session.key()  @ CasiError::Unauthorized,
    )]
    pub delegate: Account<'info, StreamerDelegate>,

    #[account(
        mut,
        seeds   = [ESCROW_SEED, escrow_id.as_ref()],
        bump    = escrow_state.bump,
        has_one = streamer  @ CasiError::Unauthorized,
        has_one = viewer    @ CasiError::Unauthorized,
        has_one = usdc_mint @ CasiError::InvalidMint,
        close   = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = cranker,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = viewer,
        associated_token::token_program = token_program,
    )]
    pub viewer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct CancelStalePending<'info> {
    #[account(mut)]
    pub cranker: Signer<'info>,

    /// CHECK: Refund + rent destination. Bound to escrow's `viewer` via `has_one`.
    #[account(mut)]
    pub viewer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds   = [ESCROW_SEED, escrow_id.as_ref()],
        bump    = escrow_state.bump,
        has_one = viewer    @ CasiError::Unauthorized,
        has_one = usdc_mint @ CasiError::InvalidMint,
        close   = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = escrow_state,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer  = cranker,
        associated_token::mint          = usdc_mint,
        associated_token::authority     = viewer,
        associated_token::token_program = token_program,
    )]
    pub viewer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program:            Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// One global config account per deployment, seeded by CONFIG_SEED.
/// Initialized once by the deployer; `accepted_mint` is immutable after that.
#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub version:            u8,
    pub admin:              Pubkey,
    /// The only token mint accepted by `initialize_escrow`. Immutable.
    pub accepted_mint:      Pubkey,
    /// When true, `initialize_escrow` is blocked. Existing escrows are unaffected.
    pub paused:             bool,
    /// Per-escrow maximum in token micro-units. 0 = no cap.
    pub max_escrow_amount:  u64,
    pub bump:               u8,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    // ─── Original layout (v0). Do NOT reorder; off-chain decoders in
    // `src/lib/casi-escrow-decoder.ts` and the reconciler read `status` at
    // byte offset 161 from the start of the account data (= 8-byte
    // discriminator + fixed fields below).
    pub escrow_id:       [u8; 32],
    pub viewer:          Pubkey,
    pub streamer:        Pubkey,
    pub usdc_mint:       Pubkey,
    pub total_amount:    u64,
    pub duration_secs:   u64,
    pub start_timestamp: i64,
    pub escrow_type:     EscrowType,
    pub status:          EscrowStatus,   // ← byte offset 161
    pub bump:            u8,             // ← byte offset 162

    // ─── v1 additions (appended so the above offsets are preserved).
    pub version:         u8,
    pub created_at:      i64,
}

#[account]
#[derive(InitSpace)]
pub struct StreamerDelegate {
    pub version:     u8,
    pub streamer:    Pubkey,
    pub session_key: Pubkey,
    pub expires_at:  i64,
    pub bump:        u8,
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowType {
    Flash,
    Beam,
}

impl EscrowType {
    pub fn from_u8(v: u8) -> Result<Self> {
        match v {
            0 => Ok(EscrowType::Flash),
            1 => Ok(EscrowType::Beam),
            _ => err!(CasiError::InvalidEscrowType),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Pending,
    Active,
    Settled,
    Cancelled,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct ConfigInitialized {
    pub admin:             Pubkey,
    pub accepted_mint:     Pubkey,
    pub max_escrow_amount: u64,
}

#[event]
pub struct ConfigUpdated {
    pub paused:            bool,
    pub max_escrow_amount: u64,
}

#[event]
pub struct AdminTransferred {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct EscrowInitialized {
    pub escrow_id:       [u8; 32],
    pub viewer:          Pubkey,
    pub streamer:        Pubkey,
    pub amount:          u64,
    pub escrow_type_val: u8,
}

#[event]
pub struct FlashSettled {
    pub escrow_id:       [u8; 32],
    pub streamer_amount: u64,
    pub approved:        bool,
}

#[event]
pub struct BeamSettled {
    pub escrow_id:      [u8; 32],
    pub streamer_amount: u64,
    pub viewer_refund:  u64,
}

#[event]
pub struct BeamStarted {
    pub escrow_id:       [u8; 32],
    pub streamer:        Pubkey,
    pub start_timestamp: i64,
    pub delegated:       bool,
}

#[event]
pub struct DelegateInstalled {
    pub streamer:    Pubkey,
    pub session_key: Pubkey,
    pub expires_at:  i64,
}

#[event]
pub struct DelegateRevoked {
    pub streamer: Pubkey,
}

#[event]
pub struct StalePendingCancelled {
    pub escrow_id: [u8; 32],
    pub age_secs:  i64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum CasiError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Duration must be > 0 for Beam escrows")]
    InvalidDuration,
    #[msg("Flash escrows must have duration_secs == 0")]
    FlashMustHaveZeroDuration,
    #[msg("Invalid escrow type — expected 0 (Flash) or 1 (Beam)")]
    InvalidEscrowType,
    #[msg("Caller is not the authorized party for this escrow")]
    Unauthorized,
    #[msg("Escrow is not in Pending status")]
    AlreadySettled,
    #[msg("Escrow is not in Active status")]
    NotActive,
    #[msg("This instruction requires a different escrow type")]
    WrongEscrowType,
    #[msg("Arithmetic overflow or underflow")]
    MathOverflow,
    #[msg("Account layout version is not supported by this program")]
    UnsupportedVersion,
    #[msg("Delegate expiry must be in the future")]
    InvalidExpiry,
    #[msg("Delegate expiry exceeds the maximum allowed lifetime")]
    DelegateLifetimeExceedsMax,
    #[msg("Delegate has expired — streamer must re-install")]
    DelegateExpired,
    #[msg("Pending escrow has not yet passed the stale timeout")]
    PendingNotStale,
    #[msg("Protocol is paused — new escrows cannot be created")]
    ProtocolPaused,
    #[msg("Token mint does not match the configured accepted mint")]
    InvalidMint,
    #[msg("Amount exceeds the per-escrow cap set in GlobalConfig")]
    AmountExceedsCap,
    #[msg("Admin address cannot be the zero address")]
    InvalidAdmin,
}
