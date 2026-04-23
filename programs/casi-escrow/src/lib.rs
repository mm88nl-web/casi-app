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

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
        TransferChecked,
    },
};

declare_id!("2TfqzhwEqDyX54fyBw6pYxqgf2VYbRvt9XH6BZkLKGa8");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// PDA seed prefix for all CASI escrow state accounts.
pub const ESCROW_SEED: &[u8] = b"casi-escrow";

/// PDA seed prefix for per-streamer delegate accounts.
pub const DELEGATE_SEED: &[u8] = b"casi-delegate";

/// Current on-chain layout version for EscrowState. Every handler verifies
/// this; legacy accounts (pre-versioning) fail to deserialize because the
/// account size changed, and any future account that somehow has a lower
/// version is rejected explicitly.
pub const ESCROW_STATE_VERSION: u8 = 1;

/// Current on-chain layout version for StreamerDelegate. Same rationale as
/// ESCROW_STATE_VERSION — gives us a single-byte migration knob forever.
pub const STREAMER_DELEGATE_VERSION: u8 = 1;

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

    /// Viewer locks USDC into a PDA-owned vault ATA.
    ///
    /// * `escrow_id`       — 32-byte UUID; used as PDA seed and stored for signing.
    /// * `amount`          — USDC micro-units (6 decimals; 1 USDC = 1_000_000).
    /// * `duration_secs`   — 0 for Flash, > 0 for Beam.
    /// * `escrow_type_val` — 0 = Flash, 1 = Beam.
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        escrow_id: [u8; 32],
        amount: u64,
        duration_secs: u64,
        escrow_type_val: u8,
    ) -> Result<()> {
        require!(amount > 0, CasiError::InvalidAmount);

        let etype = EscrowType::from_u8(escrow_type_val)?;
        if matches!(etype, EscrowType::Beam) {
            require!(duration_secs > 0, CasiError::InvalidDuration);
        }

        ctx.accounts.escrow_state.set_inner(EscrowState {
            escrow_id,
            viewer: ctx.accounts.viewer.key(),
            streamer: ctx.accounts.streamer.key(),
            usdc_mint: ctx.accounts.usdc_mint.key(),
            total_amount: amount,
            duration_secs,
            escrow_type: etype,
            status: EscrowStatus::Pending,
            start_timestamp: 0,
            bump: ctx.bumps.escrow_state,
            version: ESCROW_STATE_VERSION,
            created_at: Clock::get()?.unix_timestamp,
        });

        // Transfer USDC viewer → vault (transfer_checked requires mint + decimals)
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
            viewer: ctx.accounts.viewer.key(),
            streamer: ctx.accounts.streamer.key(),
            amount,
            escrow_type_val,
        });

        Ok(())
    }

    /// Streamer approves a Flash: full amount → streamer ATA.
    /// Vault + EscrowState are closed; rent returned to streamer.
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

        // Close vault ATA → SOL rent to streamer
        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.streamer.to_account_info(),
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

        ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

        let total = ctx.accounts.escrow_state.total_amount;
        let bump  = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[u8]] = &[ESCROW_SEED, escrow_id.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        // Full refund → viewer
        pda_transfer_checked(
            &ctx.accounts.vault,
            &ctx.accounts.viewer_ata,
            total,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.escrow_state.to_account_info(),
            &ctx.accounts.token_program,
            signer,
        )?;

        // Close vault ATA → SOL rent to viewer
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
    /// themselves. See the `StreamerDelegate` docs for the trust model. The
    /// delegate is constrained to call on escrows where the delegate's own
    /// `streamer` field matches the escrow's `streamer` — so a compromised
    /// delegate key can only start beams for the streamer who installed it,
    /// and only until `expires_at` passes.
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

    /// Beam settlement.
    ///
    /// * Before `duration` elapses: only `streamer` or `viewer` may call — either
    ///   party can end the stream early and accept the pro-rata split.
    /// * After `duration` elapses: permissionless (anyone may crank), so funds
    ///   can always be released even if both parties go offline.
    ///
    /// Integer proration: vested = total × min(elapsed, duration) / duration.
    /// Streamer receives the full vested portion; remainder refunded to viewer.
    /// Vault + EscrowState closed; rent returned to streamer.
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
        // Sanity: `now` should never precede `start_ts` on a well-formed chain,
        // but we clamp to 0 defensively (vesting clock can't run backwards).
        let elapsed  = now.saturating_sub(start_ts).max(0) as u64;
        let duration = ctx.accounts.escrow_state.duration_secs;
        let total    = ctx.accounts.escrow_state.total_amount;
        let bump     = ctx.accounts.escrow_state.bump;

        require!(duration > 0, CasiError::InvalidDuration);

        // Anti-grief: before duration elapses, only the two parties that
        // consented to this escrow may settle. After duration, permissionless.
        let caller_key = ctx.accounts.caller.key();
        let is_party   = caller_key == ctx.accounts.escrow_state.streamer
                      || caller_key == ctx.accounts.escrow_state.viewer;
        require!(is_party || elapsed >= duration, CasiError::Unauthorized);

        // Integer proration with u128 intermediate to eliminate overflow risk.
        // worst case: u64::MAX * u64::MAX = u128::MAX / 4, well within u128 range.
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

        // Close vault ATA → SOL rent to streamer
        pda_close_account(
            &ctx.accounts.vault,
            ctx.accounts.streamer.to_account_info(),
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
    /// `settle_beam` (pro-rata vest, vault closes, rent to streamer) except
    /// the authorization comes from a pre-registered session key instead of
    /// the streamer's own wallet. Extends the scoped-delegation trust model
    /// to the high-frequency "end early / play next" action.
    ///
    /// Authorization is the delegate PDA's constraints:
    ///   * `delegate.session_key == session.key()` — ephemeral server key.
    ///   * `delegate.streamer    == escrow.streamer` — per-streamer scope.
    ///   * `now < delegate.expires_at` — time-bound.
    ///
    /// No caller-is-party check: the delegate binding IS the streamer's
    /// authorization (equivalent to the streamer personally signing).
    ///
    /// Fee + ATA-init payer is a separate `cranker` signer: the session key
    /// has no SOL (Solana rejects "debit before credit" on zero-balance
    /// accounts), and init_if_needed for `streamer_ata`/`viewer_ata` needs a
    /// funded payer. Cranker does not appear in the state machine otherwise.
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
            ctx.accounts.streamer.to_account_info(),
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

    /// Delegated Flash approval. Same effect as `approve_flash` (full amount →
    /// streamer ATA, vault + EscrowState closed, rent to streamer), but signed
    /// by the session key instead of the streamer wallet. Cranker pays fees
    /// and any ATA-init rent. Vesting math isn't involved — approval moves
    /// the full balance, so the only attack surface on a compromised session
    /// key is forcing a capture that would have happened anyway (or forcing
    /// one for a flash the streamer hadn't reviewed). Bounded, recoverable
    /// by `revoke_delegate`.
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
            ctx.accounts.streamer.to_account_info(),
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

    /// Delegated Flash denial. Same effect as `deny_flash` (full refund → viewer
    /// ATA, vault + EscrowState closed, rent to viewer), signed by the session
    /// key. Cranker pays fees and any viewer ATA-init rent (almost always the
    /// viewer already has a USDC ATA since they funded from it).
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
    /// Trust model:
    ///   * The delegate PDA is seeded by the streamer's pubkey, so only the
    ///     streamer can install one for themselves.
    ///   * `session_key` is an ephemeral pubkey (the server generates a fresh
    ///     keypair on each install; the secret stays server-side, encrypted).
    ///   * The delegate can call `start_beam_delegated` (Pending → Active),
    ///     `settle_beam_delegated` (end an Active beam, pro-rata vest),
    ///     `approve_flash_delegated` (Pending → Settled, full to streamer),
    ///     and `deny_flash_delegated` (Pending → Cancelled, full refund to
    ///     viewer). It CANNOT cancel Pending escrows on the viewer's behalf,
    ///     move its own rent, or change delegation. Worst-case server
    ///     compromise is an attacker forcing a flash capture/refund (either
    ///     way the funds follow the escrow's declared destinations — streamer
    ///     or viewer) or ending a live beam early. Bounded, recoverable by
    ///     `revoke_delegate`, never leaks funds to the attacker.
    ///   * Self-expires after `expires_at`; program caps expiry to
    ///     `now + MAX_DELEGATE_LIFETIME_SECS`.
    ///   * Streamer can revoke any time via `revoke_delegate`.
    ///
    /// Re-calling overwrites the session_key / expires_at in-place, which is
    /// how rotation works — no need to revoke-then-install.
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
    /// refunds to the streamer. After this, any in-flight `start_beam_delegated`
    /// calls from the revoked session key fail (delegate account missing).
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
    // Stale-pending permissionless cancel
    // -----------------------------------------------------------------------

    /// Permissionless refund for a Pending escrow that has sat untouched past
    /// `PENDING_TIMEOUT_SECS` since creation.
    ///
    /// Anyone can crank this. The only effect is a 100% refund to the viewer
    /// — the same outcome as `cancel_escrow` (viewer-signed), just unlocked
    /// by the wall clock instead of the viewer's wallet. This protects users
    /// from USDC being held hostage if the streamer goes offline without
    /// approving / denying, or if the viewer themselves loses access to their
    /// wallet.
    ///
    /// Safety: the refund destination is forced to `viewer_ata`, and the PDA
    /// closes to the viewer as `cancel_escrow` does, so a third-party cranker
    /// cannot redirect funds.
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
// Shared helpers (mirrors program-examples shared.rs pattern)
// ---------------------------------------------------------------------------

/// `transfer_checked` from a user-signed ATA (non-PDA).
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

/// `transfer_checked` signed by a PDA.
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

/// Close a token account signed by a PDA.
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
#[instruction(escrow_id: [u8; 32])]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub viewer: Signer<'info>,

    /// CHECK: Streamer wallet — stored in EscrowState, verified on settle/deny.
    pub streamer: UncheckedAccount<'info>,

    #[account(
        init,
        payer  = viewer,
        space  = 8 + EscrowState::INIT_SPACE,
        seeds  = [ESCROW_SEED, escrow_id.as_ref()],
        bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    /// PDA-owned vault ATA — holds viewer's USDC during escrow.
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

    #[account(mint::token_program = token_program)]
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

    /// CHECK: Viewer wallet — kept in the account list so clients can pass
    /// the full party set for indexing/event-matching; not read on-chain.
    #[account(mut)]
    pub viewer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds    = [ESCROW_SEED, escrow_id.as_ref()],
        bump     = escrow_state.bump,
        has_one  = streamer @ CasiError::Unauthorized,
        close    = streamer,
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
        has_one = streamer @ CasiError::Unauthorized,
        has_one = viewer   @ CasiError::Unauthorized,
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
        has_one = viewer @ CasiError::Unauthorized,
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
        has_one = streamer @ CasiError::Unauthorized,
        has_one = viewer   @ CasiError::Unauthorized,
        close   = streamer,
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
    /// The ephemeral session key (server-held). Must match `delegate.session_key`.
    pub session: Signer<'info>,

    /// CHECK: Identifies the streamer whose delegate this is. Not a signer here;
    /// constraints below bind this key to both the delegate PDA seed and the
    /// escrow's own `streamer` field, preventing cross-streamer abuse.
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
    /// The ephemeral session key. Must match `delegate.session_key`.
    pub session: Signer<'info>,

    /// Fee + ATA-init payer. The session key has no SOL; a funded co-signer
    /// (the server-side "cranker") pays every delegated instruction's rent.
    #[account(mut)]
    pub cranker: Signer<'info>,

    /// CHECK: Receives streamer_amt, the vault ATA rent (via close = streamer)
    /// and the EscrowState rent. Not a signer; bound to the escrow's
    /// `streamer` field via `has_one` below so the delegate cannot redirect
    /// funds. Must match the streamer stored on the delegate PDA.
    #[account(mut)]
    pub streamer: SystemAccount<'info>,

    /// CHECK: Refund destination. Bound to the escrow's `viewer` field via
    /// `has_one` below; cannot be redirected.
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
        has_one = streamer @ CasiError::Unauthorized,
        has_one = viewer   @ CasiError::Unauthorized,
        close   = streamer,
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
    /// The ephemeral session key. Must match `delegate.session_key`.
    pub session: Signer<'info>,

    /// Fee + ATA-init payer. The session key has no SOL; cranker co-signs.
    #[account(mut)]
    pub cranker: Signer<'info>,

    /// CHECK: Receives the EscrowState rent (via close = streamer) and the
    /// vault ATA rent (via pda_close_account). Bound to the escrow's
    /// `streamer` field via `has_one` and to the delegate PDA's seed via
    /// the `delegate` constraint, so a compromised session key cannot
    /// redirect funds to an attacker-controlled address.
    #[account(mut)]
    pub streamer: SystemAccount<'info>,

    /// CHECK: Kept in the account list for event-indexing parity with
    /// `approve_flash`; not read on-chain.
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
        has_one  = streamer @ CasiError::Unauthorized,
        close    = streamer,
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
    /// The ephemeral session key. Must match `delegate.session_key`.
    pub session: Signer<'info>,

    /// Fee + ATA-init payer.
    #[account(mut)]
    pub cranker: Signer<'info>,

    /// CHECK: Delegate-PDA seed; bound via the `delegate` constraint. Not a
    /// funds destination here (deny sends everything back to `viewer`).
    pub streamer: SystemAccount<'info>,

    /// CHECK: Refund destination + EscrowState close recipient + vault rent
    /// recipient. Bound to the escrow's `viewer` field via `has_one`.
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
        has_one = streamer @ CasiError::Unauthorized,
        has_one = viewer   @ CasiError::Unauthorized,
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
    /// Anyone may crank; they pay the tx fee but receive nothing.
    #[account(mut)]
    pub cranker: Signer<'info>,

    /// CHECK: Target of the refund + rent. Bound to the escrow's `viewer`
    /// field below so a cranker can't redirect funds. Not a signer.
    #[account(mut)]
    pub viewer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds   = [ESCROW_SEED, escrow_id.as_ref()],
        bump    = escrow_state.bump,
        has_one = viewer @ CasiError::Unauthorized,
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

    /// Forced to the viewer's ATA for `usdc_mint` — a cranker cannot point
    /// this anywhere else. `init_if_needed` so a viewer with a closed ATA
    /// still gets refunded.
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
    /// Layout version. Must equal ESCROW_STATE_VERSION; handlers reject any
    /// other value. Gives us a one-byte migration knob for future upgrades.
    pub version:         u8,
    /// Unix seconds. Stamped by `initialize_escrow` from the slot clock.
    /// Used by `cancel_stale_pending` to decide when an unacted-on Pending
    /// escrow is fair game for a permissionless refund.
    pub created_at:      i64,
}

/// Per-streamer session-key delegate. Seeded by `[DELEGATE_SEED, streamer]`
/// so there is at most one active delegate per streamer — re-installing
/// overwrites in place (key rotation).
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
pub struct EscrowInitialized {
    pub escrow_id:      [u8; 32],
    pub viewer:         Pubkey,
    pub streamer:       Pubkey,
    pub amount:         u64,
    pub escrow_type_val: u8,
}

#[event]
pub struct FlashSettled {
    pub escrow_id:      [u8; 32],
    pub streamer_amount: u64,
    pub approved:       bool,
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
    /// True when the caller was a session-key delegate, false when the
    /// streamer signed directly. Useful for off-chain analytics tracking
    /// adoption of the delegation flow.
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
}
