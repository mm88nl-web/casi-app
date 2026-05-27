import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, BN, setProvider } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import { SOLANA_RPC } from '@/lib/solana-network';
import { deriveConfigPda, PROGRAM_ID, USDC_MINT_DEVNET } from '@/lib/casi-escrow';
import { logError, logWarn } from '@/lib/observability';
import IDL from '@/idl/casi_escrow.json';
import { decodeBase58 } from '@/lib/casi-escrow-decoder';

export const dynamic = 'force-dynamic';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

function loadDeployerKeypair(): Keypair | null {
  const raw = process.env.SOLANA_DEPLOYER_KEYPAIR;
  if (!raw) return null;
  try {
    if (raw.trim().startsWith('[')) {
      const arr = JSON.parse(raw) as number[];
      if (!Array.isArray(arr) || arr.length !== 64) return null;
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    const bytes = decodeBase58(raw.trim());
    if (bytes.length !== 64) return null;
    return Keypair.fromSecretKey(bytes);
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/init-escrow-config
 *
 * One-shot: calls initialize_config on the deployed casi-escrow program.
 * Required once after the hardening deploy (c99d663) that added GlobalConfig.
 * Safe to call again — returns 200 with already_initialized=true if config exists.
 *
 * Auth: requires a valid Supabase session belonging to a streamer with
 * username 'casi' (the platform admin). The deployer keypair is loaded from
 * SOLANA_DEPLOYER_KEYPAIR env var (JSON byte array or base58 64-byte secret).
 */
export async function POST(req: NextRequest) {
  // ── auth: must be the platform admin ────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only the 'casi' account can call this
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();
  if (profile?.username !== 'casi') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── load deployer keypair ────────────────────────────────────────────────
  const deployer = loadDeployerKeypair();
  if (!deployer) {
    return NextResponse.json({
      error: 'SOLANA_DEPLOYER_KEYPAIR env var is not set or malformed.',
      hint: 'Set it in Vercel to the JSON byte array or base58 secret of the program upgrade authority.',
    }, { status: 503 });
  }

  const conn = new Connection(SOLANA_RPC, 'confirmed');

  // ── check if already initialized ────────────────────────────────────────
  const [configPda] = deriveConfigPda();
  const existing = await conn.getAccountInfo(configPda).catch(() => null);
  if (existing) {
    return NextResponse.json({
      ok: true,
      already_initialized: true,
      config_pda: configPda.toBase58(),
    });
  }

  // ── derive programData + verify upgrade authority ────────────────────────
  const progInfo = await conn.getAccountInfo(PROGRAM_ID).catch(() => null);
  if (!progInfo) {
    return NextResponse.json({ error: 'Program not found on this cluster.' }, { status: 404 });
  }
  const programDataAddress = new PublicKey(progInfo.data.slice(4, 36));
  const pdInfo = await conn.getAccountInfo(programDataAddress).catch(() => null);
  if (!pdInfo || pdInfo.data.length < 45) {
    return NextResponse.json({ error: 'Could not read ProgramData account.' }, { status: 500 });
  }
  const upgradeAuth = new PublicKey(pdInfo.data.slice(13, 45));
  if (!upgradeAuth.equals(deployer.publicKey)) {
    logWarn('init-escrow-config', 'deployer key does not match upgrade authority', {
      upgrade_authority: upgradeAuth.toBase58(),
      deployer_key: deployer.publicKey.toBase58(),
    });
    return NextResponse.json({
      error: 'SOLANA_DEPLOYER_KEYPAIR is not the upgrade authority.',
      upgrade_authority: upgradeAuth.toBase58(),
      deployer_key: deployer.publicKey.toBase58(),
    }, { status: 400 });
  }

  // ── call initialize_config ───────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet: any = {
      publicKey: deployer.publicKey,
      signTransaction:     async (tx: any) => { tx.partialSign(deployer); return tx; },
      signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(deployer)); return txs; },
    };
    const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
    setProvider(provider);
    const program = new Program(IDL as Idl, provider);

    const sig = await (program.methods as any)
      .initializeConfig(new BN(0), new BN(0))
      .accounts({
        initializer:   deployer.publicKey,
        config:        configPda,
        acceptedMint:  USDC_MINT_DEVNET,
        programData:   programDataAddress,
        tokenProgram:  TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();

    return NextResponse.json({
      ok: true,
      already_initialized: false,
      sig,
      config_pda: configPda.toBase58(),
    });
  } catch (err) {
    logError('init-escrow-config', err);
    return NextResponse.json({
      error: 'initialize_config failed',
      message: (err as Error).message,
      logs: (err as { logs?: string[] }).logs ?? null,
    }, { status: 500 });
  }
}
