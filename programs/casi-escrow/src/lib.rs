use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

declare_id!("CASIesCRow1111111111111111111111111111111111");

/// Platform fee: 5% = 500 basis points.
const CASI_FEE_BPS: u64 = 500;

/// Hardcoded CASI fee wallet (update before mainnet deploy).
/// Replace with the actual CASI treasury pubkey.
pub mod fee_wallet {
    use super::*;
    declare_id!("CASIFeeWaLLet1111111111111111111111111111111");
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

#[program]
pub mod casi_escrow {
    use super::*;

    /// Lock viewer USDC into a PDA vault.
    ///
    /// - `escrow_id`: 32-byte UUID identifying this escrow (stored for PDA signing).
    /// - `amount`:    USDC micro-units (6 decimal places, e.g. 1_000_000 = $1).
    /// - `duration_secs`: 0 = Flash (instant one-shot); >0 = Beam (time-streamed).
    /// - `escrow_type_val`: 0 = Flash, 1 = Beam.
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

        let state = &mut ctx.accounts.escrow_state;
        state.escrow_id = escrow_id;
        state.viewer = ctx.accounts.viewer.key();
        state.streamer = ctx.accounts.streamer.key();
        state.usdc_mint = ctx.accounts.usdc_mint.key();
        state.total_amount = amount;
        state.duration_secs = duration_secs;
        state.escrow_type = etype;
        state.status = EscrowStatus::Pending;
        state.start_timestamp = 0;
        state.bump = ctx.bumps.escrow_state;

        // Transfer USDC from viewer → vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.viewer_ata.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.viewer.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(EscrowInitialized {
            escrow_id,
            viewer: state.viewer,
            streamer: state.streamer,
            amount,
            escrow_type_val,
        });

        Ok(())
    }

    /// Streamer approves a Flash: releases 95% to streamer, 5% to CASI.
    /// Vault and EscrowState accounts are closed; rent returned to streamer.
    pub fn approve_flash(
        ctx: Context<ApproveFlash>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        {
            let state = &mut ctx.accounts.escrow_state;
            require!(
                state.streamer == ctx.accounts.streamer.key(),
                CasiError::Unauthorized
            );
            require!(
                state.status == EscrowStatus::Pending,
                CasiError::AlreadySettled
            );
            require!(
                state.escrow_type == EscrowType::Flash,
                CasiError::WrongEscrowType
            );
            state.status = EscrowStatus::Settled;
        }

        let total = ctx.accounts.escrow_state.total_amount;
        let bump = ctx.accounts.escrow_state.bump;
        let fee = total * CASI_FEE_BPS / 10_000;
        let streamer_amt = total - fee;

        let seeds: &[&[u8]] = &[b"casi-escrow", escrow_id.as_ref(), &[bump]];
        let signer = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.streamer_ata.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            ),
            streamer_amt,
        )?;

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.fee_wallet_ata.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            ),
            fee,
        )?;

        // Close vault → SOL rent back to streamer
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.streamer.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer,
        ))?;

        // (escrow_state closed by Anchor via `close = streamer` constraint)

        emit!(FlashSettled {
            escrow_id,
            streamer_amount: streamer_amt,
            fee_amount: fee,
            approved: true,
        });

        Ok(())
    }

    /// Streamer denies a Flash: full refund to viewer.
    /// Vault and EscrowState are closed; rent returned to viewer.
    pub fn deny_flash(
        ctx: Context<DenyFlash>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        {
            let state = &mut ctx.accounts.escrow_state;
            require!(
                state.streamer == ctx.accounts.streamer.key(),
                CasiError::Unauthorized
            );
            require!(
                state.status == EscrowStatus::Pending,
                CasiError::AlreadySettled
            );
            state.status = EscrowStatus::Cancelled;
        }

        let total = ctx.accounts.escrow_state.total_amount;
        let bump = ctx.accounts.escrow_state.bump;

        let seeds: &[&[u8]] = &[b"casi-escrow", escrow_id.as_ref(), &[bump]];
        let signer = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.viewer_ata.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            ),
            total,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.viewer.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer,
        ))?;

        emit!(FlashSettled {
            escrow_id,
            streamer_amount: 0,
            fee_amount: 0,
            approved: false,
        });

        Ok(())
    }

    /// Viewer cancels a pending escrow (before streamer acts).
    /// Works for both Flash and Beam while status == Pending.
    pub fn cancel_escrow(
        ctx: Context<CancelEscrow>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        {
            let state = &mut ctx.accounts.escrow_state;
            require!(
                state.viewer == ctx.accounts.viewer.key(),
                CasiError::Unauthorized
            );
            require!(
                state.status == EscrowStatus::Pending,
                CasiError::AlreadySettled
            );
            state.status = EscrowStatus::Cancelled;
        }

        let total = ctx.accounts.escrow_state.total_amount;
        let bump = ctx.accounts.escrow_state.bump;

        let seeds: &[&[u8]] = &[b"casi-escrow", escrow_id.as_ref(), &[bump]];
        let signer = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.viewer_ata.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            ),
            total,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.viewer.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer,
        ))?;

        Ok(())
    }

    /// Streamer starts a Beam (approves streaming).
    /// Sets start_timestamp to the current clock; status → Active.
    pub fn start_beam(
        ctx: Context<StartBeam>,
        _escrow_id: [u8; 32],
    ) -> Result<()> {
        let state = &mut ctx.accounts.escrow_state;
        require!(
            state.streamer == ctx.accounts.streamer.key(),
            CasiError::Unauthorized
        );
        require!(
            state.status == EscrowStatus::Pending,
            CasiError::AlreadySettled
        );
        require!(
            state.escrow_type == EscrowType::Beam,
            CasiError::WrongEscrowType
        );
        require!(state.duration_secs > 0, CasiError::InvalidDuration);

        state.status = EscrowStatus::Active;
        state.start_timestamp = Clock::get()?.unix_timestamp;

        Ok(())
    }

    /// Permissionless settle for a Beam.
    /// Anyone can call once the stream has started (during or after).
    /// Prorates vested amount by wall-clock time; sends to streamer (95%) and
    /// CASI (5%); refunds unvested portion to viewer.
    pub fn settle_beam(
        ctx: Context<SettleBeam>,
        escrow_id: [u8; 32],
    ) -> Result<()> {
        {
            let state = &mut ctx.accounts.escrow_state;
            require!(
                state.status == EscrowStatus::Active,
                CasiError::NotActive
            );
            require!(
                state.escrow_type == EscrowType::Beam,
                CasiError::WrongEscrowType
            );
        }

        let now = Clock::get()?.unix_timestamp;
        let state = &mut ctx.accounts.escrow_state;
        let elapsed = (now - state.start_timestamp).max(0) as u64;
        let duration = state.duration_secs;
        let total = state.total_amount;
        let bump = state.bump;

        // Integer proration: vested = total * min(elapsed, duration) / duration
        let vested_ticks = elapsed.min(duration);
        let gross_vested = total
            .checked_mul(vested_ticks)
            .unwrap()
            .checked_div(duration)
            .unwrap();
        let refund = total - gross_vested;

        // 5% fee on vested portion only
        let fee = gross_vested * CASI_FEE_BPS / 10_000;
        let streamer_amt = gross_vested - fee;

        state.status = EscrowStatus::Settled;

        let seeds: &[&[u8]] = &[b"casi-escrow", escrow_id.as_ref(), &[bump]];
        let signer = &[seeds];

        if streamer_amt > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.streamer_ata.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                    signer,
                ),
                streamer_amt,
            )?;
        }

        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.fee_wallet_ata.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                    signer,
                ),
                fee,
            )?;
        }

        if refund > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.viewer_ata.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                    signer,
                ),
                refund,
            )?;
        }

        // Close vault → SOL rent back to streamer
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.streamer.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer,
        ))?;

        emit!(BeamSettled {
            escrow_id,
            streamer_amount: streamer_amt,
            fee_amount: fee,
            viewer_refund: refund,
        });

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Account Contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub viewer: Signer<'info>,

    /// CHECK: Streamer pubkey — stored in escrow_state and verified on settle.
    pub streamer: UncheckedAccount<'info>,

    #[account(
        init,
        payer = viewer,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"casi-escrow", escrow_id.as_ref()],
        bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    /// PDA-owned USDC vault (ATA).
    #[account(
        init,
        payer = viewer,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = viewer,
    )]
    pub viewer_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct ApproveFlash<'info> {
    #[account(mut)]
    pub streamer: Signer<'info>,

    /// CHECK: Viewer SOL address — receives vault's ATA rent on close.
    #[account(mut)]
    pub viewer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"casi-escrow", escrow_id.as_ref()],
        bump = escrow_state.bump,
        close = streamer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = streamer,
        associated_token::mint = usdc_mint,
        associated_token::authority = streamer,
    )]
    pub streamer_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = streamer,
        associated_token::mint = usdc_mint,
        associated_token::authority = fee_wallet,
    )]
    pub fee_wallet_ata: Account<'info, TokenAccount>,

    /// CHECK: Hardcoded CASI fee wallet.
    #[account(address = fee_wallet::ID)]
    pub fee_wallet: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct DenyFlash<'info> {
    /// CHECK: Streamer verifies themselves via escrow_state.streamer check in handler.
    pub streamer: Signer<'info>,

    #[account(mut)]
    pub viewer: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"casi-escrow", escrow_id.as_ref()],
        bump = escrow_state.bump,
        close = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = streamer,
        associated_token::mint = usdc_mint,
        associated_token::authority = viewer,
    )]
    pub viewer_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct CancelEscrow<'info> {
    #[account(mut)]
    pub viewer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"casi-escrow", escrow_id.as_ref()],
        bump = escrow_state.bump,
        close = viewer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = viewer,
    )]
    pub viewer_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(_escrow_id: [u8; 32])]
pub struct StartBeam<'info> {
    pub streamer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"casi-escrow", _escrow_id.as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
}

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct SettleBeam<'info> {
    /// CHECK: Any caller may trigger settlement once the stream is Active.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut)]
    pub streamer: SystemAccount<'info>,

    #[account(mut)]
    pub viewer: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"casi-escrow", escrow_id.as_ref()],
        bump = escrow_state.bump,
        close = streamer,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = usdc_mint,
        associated_token::authority = streamer,
    )]
    pub streamer_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = usdc_mint,
        associated_token::authority = viewer,
    )]
    pub viewer_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = usdc_mint,
        associated_token::authority = fee_wallet,
    )]
    pub fee_wallet_ata: Account<'info, TokenAccount>,

    /// CHECK: Hardcoded CASI fee wallet.
    #[account(address = fee_wallet::ID)]
    pub fee_wallet: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    /// The 32-byte UUID identifying this escrow (used as PDA seed).
    pub escrow_id: [u8; 32],
    /// Viewer who locked the funds.
    pub viewer: Pubkey,
    /// Streamer who will receive (or return) the funds.
    pub streamer: Pubkey,
    /// USDC mint address.
    pub usdc_mint: Pubkey,
    /// Total locked amount in USDC micro-units (6 decimals).
    pub total_amount: u64,
    /// Stream duration in seconds (0 for Flash, >0 for Beam).
    pub duration_secs: u64,
    /// Unix timestamp when the Beam started (0 until start_beam is called).
    pub start_timestamp: i64,
    /// Flash | Beam
    pub escrow_type: EscrowType,
    /// Pending | Active | Settled | Cancelled
    pub status: EscrowStatus,
    /// PDA bump seed.
    pub bump: u8,
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
    pub escrow_id: [u8; 32],
    pub viewer: Pubkey,
    pub streamer: Pubkey,
    pub amount: u64,
    pub escrow_type_val: u8,
}

#[event]
pub struct FlashSettled {
    pub escrow_id: [u8; 32],
    pub streamer_amount: u64,
    pub fee_amount: u64,
    pub approved: bool,
}

#[event]
pub struct BeamSettled {
    pub escrow_id: [u8; 32],
    pub streamer_amount: u64,
    pub fee_amount: u64,
    pub viewer_refund: u64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum CasiError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Duration must be greater than zero for Beam escrows")]
    InvalidDuration,
    #[msg("Invalid escrow type value — expected 0 (Flash) or 1 (Beam)")]
    InvalidEscrowType,
    #[msg("Caller is not the authorized party for this escrow")]
    Unauthorized,
    #[msg("Escrow has already been settled or cancelled")]
    AlreadySettled,
    #[msg("Escrow is not in Active state")]
    NotActive,
    #[msg("Instruction requires a different escrow type")]
    WrongEscrowType,
}
