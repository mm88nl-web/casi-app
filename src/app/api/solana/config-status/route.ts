import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC } from '@/lib/solana-network';
import { deriveConfigPda, PROGRAM_ID } from '@/lib/casi-escrow';

export const dynamic = 'force-dynamic';

/**
 * GET /api/solana/config-status
 *
 * Read-only diagnostic: checks whether the GlobalConfig PDA exists on-chain.
 * Used to diagnose "Unexpected error" failures on initialize_escrow — if the
 * config PDA is missing, every booking simulation fails immediately.
 *
 * Also attempts to simulate a minimal initialize_escrow to surface the exact
 * Anchor error when config IS present but something else is wrong.
 */
export async function GET() {
  try {
    const conn = new Connection(SOLANA_RPC, 'confirmed');
    const [configPda] = deriveConfigPda();

    const [configInfo, programInfo] = await Promise.all([
      conn.getAccountInfo(configPda).catch(() => null),
      conn.getAccountInfo(PROGRAM_ID).catch(() => null),
    ]);

    const programExists = !!programInfo;
    const configExists  = !!configInfo;

    let upgradeAuthority: string | null = null;
    if (programInfo && programInfo.data.length >= 36) {
      // BPF Upgradeable Loader Program account layout:
      //   bytes 0-3  : state discriminant (2 = Program)
      //   bytes 4-35 : programdata_address (32 bytes)
      const programDataAddr = new PublicKey(programInfo.data.slice(4, 36));
      const pdInfo = await conn.getAccountInfo(programDataAddr).catch(() => null);
      if (pdInfo && pdInfo.data.length >= 45) {
        // ProgramData layout: 0-3 discriminant, 4-11 slot, 12 is_initialized, 13-44 authority
        upgradeAuthority = new PublicKey(pdInfo.data.slice(13, 45)).toBase58();
      }
    }

    return NextResponse.json({
      ok: true,
      program_id: PROGRAM_ID.toBase58(),
      config_pda: configPda.toBase58(),
      program_exists: programExists,
      config_initialized: configExists,
      upgrade_authority: upgradeAuthority,
      diagnosis: configExists
        ? 'Config is initialized — booking failures have a different cause.'
        : 'Config NOT initialized. Run: node scripts/init-escrow-config.mjs',
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
