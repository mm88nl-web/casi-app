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

declare_id!("11111111111111111111111111111111");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// PDA seed prefix for all CASI escrow state accounts.
pub const ESCROW_SEED: &[u8] = b"casi-escrow";

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
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );
        require!(
            ctx.accounts.escrow_state.escrow_type == EscrowType::Beam,
            CasiError::WrongEscrowType
        );

        ctx.accounts.escrow_state.status = EscrowStatus::Active;
        ctx.accounts.escrow_state.start_timestamp = Clock::get()?.unix_timestamp;

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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub escrow_id:       [u8; 32],
    pub viewer:          Pubkey,
    pub streamer:        Pubkey,
    pub usdc_mint:       Pubkey,
    pub total_amount:    u64,
    pub duration_secs:   u64,
    pub start_timestamp: i64,
    pub escrow_type:     EscrowType,
    pub status:          EscrowStatus,
    pub bump:            u8,
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
}
