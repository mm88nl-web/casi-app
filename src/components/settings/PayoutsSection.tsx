'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import SettingsSection from './SettingsSection';
import GhostButton from './GhostButton';
import StripeIcon from '@/components/icons/StripeIcon';
import SolanaIcon from '@/components/icons/SolanaIcon';

type Props = {
  supabase: SupabaseClient;
  profileId: string;
  initialStripeAccountId: string | null;
  initialSolanaWallet: string | null;
};

type StripeStatus =
  | { kind: 'loading' }
  | { kind: 'not_connected' }
  | {
      kind: 'pending' | 'active' | 'restricted';
      accountId: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      dueCount: number;
      defaultCurrency: string | null;
    }
  | { kind: 'error'; message: string };

type ConnectedCardProps = {
  logo: React.ReactNode;
  title: React.ReactNode;
  meta: React.ReactNode;
  action: React.ReactNode;
  /** Allow `meta` to wrap onto multiple lines and surface long content
   *  (typically Stripe error messages with URLs). Default keeps the
   *  tight nowrap+ellipsis treatment for normal status strings. */
  wrapMeta?: boolean;
};

function ConnectedCard({ logo, title, meta, action, wrapMeta = false }: ConnectedCardProps) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{
        padding: '14px 16px',
        background: 'var(--casi-surface-2, var(--surf-2))',
        border: '1px solid var(--line, var(--casi-border))',
        borderRadius: 'var(--radius-row)',
      }}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {logo}
        <div className="min-w-0">
          <div
            style={{
              fontFamily: 'var(--B)',
              fontWeight: 700,
              fontSize: '17px',
              letterSpacing: '-0.01em',
              color: 'var(--text, var(--casi-text))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div
            className="mt-1"
            style={{
              fontFamily: 'var(--S)',
              fontStyle: 'italic',
              fontSize: '13px',
              color: 'var(--text-2, var(--casi-text-dim))',
              overflow: wrapMeta ? 'visible' : 'hidden',
              textOverflow: wrapMeta ? 'clip' : 'ellipsis',
              whiteSpace: wrapMeta ? 'normal' : 'nowrap',
              lineHeight: wrapMeta ? 1.45 : undefined,
            }}
          >
            {meta}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">{action}</div>
    </div>
  );
}

/**
 * Renders a string and turns any embedded URL into a clickable link. We
 * use it for Stripe error messages — Stripe's API frequently embeds a
 * resolution URL in the .message field (e.g. "Please review the
 * responsibilities ... at https://dashboard.stripe.com/...") and a plain
 * text render swallows that URL into an opaque, truncated sentence.
 */
function MessageWithLinks({ text }: { text: string }) {
  // Conservative URL regex — matches http(s):// up to the next whitespace.
  // Stripe error messages don't embed inline punctuation that we'd want
  // stripped from the URL, so the simple form is fine here.
  const parts = text.split(/(https?:\/\/\S+)/);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--ink, var(--casi-accent2))',
              textDecoration: 'underline',
              wordBreak: 'break-all',
            }}
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function StatusDot({ kind }: { kind: 'ok' | 'warn' | 'off' }) {
  const colors: Record<typeof kind, string> = {
    ok:   'var(--ink, var(--casi-accent2))',
    warn: '#f59e0b',
    off:  'var(--ink-22, rgba(255,255,255,0.18))',
  };
  return (
    <span
      className="mr-1.5 inline-block"
      style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: colors[kind],
      }}
    />
  );
}

function shortPk(pk: string): string {
  if (pk.length < 9) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function shortAcct(id: string): string {
  // acct_1OxxxxxxxxxxxxxxX → acct_••••xxxX
  if (!id.startsWith('acct_')) return id;
  return `acct_••••${id.slice(-4)}`;
}

// Tile-wrapped brand marks: 40×40 ink-tinted square holds the icon at a
// readable size regardless of the surrounding palette. The light tint
// (`var(--ink-04)`) avoids the icon clashing with `var(--paper)` on light
// skins where a saturated brand color background would scream.
const STRIPE_LOGO = (
  <div
    className="flex shrink-0 items-center justify-center"
    style={{
      width: '44px',
      height: '44px',
      borderRadius: 'var(--radius-chip)',
      background: 'var(--casi-bg)',
      border: '1px solid var(--line)',
    }}
  >
    <StripeIcon size={14} />
  </div>
);

const SOLANA_LOGO = (
  <div
    className="flex shrink-0 items-center justify-center"
    style={{
      width: '44px',
      height: '44px',
      borderRadius: 'var(--radius-chip)',
      background: 'var(--casi-bg)',
      border: '1px solid var(--line)',
    }}
  >
    <SolanaIcon size={18} />
  </div>
);

export default function PayoutsSection({
  supabase,
  profileId,
  initialStripeAccountId,
  initialSolanaWallet,
}: Props) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [stripe, setStripe] = useState<StripeStatus>(
    initialStripeAccountId ? { kind: 'loading' } : { kind: 'not_connected' },
  );
  const [savedWallet, setSavedWallet] = useState<string | null>(initialSolanaWallet);
  const [busy, setBusy] = useState<'stripe' | 'wallet' | 'register' | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  // Null = not checked yet. A streamer whose wallet was saved before this
  // on-chain check existed (or whose registration tx failed silently) would
  // otherwise never learn their Solana bookings can't work — see
  // docs/fable-security-review-2026-08-10.md Finding 4 / register_streamer
  // in lib.rs. initialize_escrow now requires this account to exist.
  const [registered, setRegistered] = useState<boolean | null>(null);

  // ── Stripe status fetch ──────────────────────────────────────────────────
  useEffect(() => {
    if (!initialStripeAccountId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setStripe({ kind: 'error', message: 'Not signed in' });
          return;
        }
        const res = await fetch('/api/stripe/connect/status', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStripe({ kind: 'error', message: j?.error || `Status check failed (${res.status})` });
          return;
        }
        if (j.status === 'not_connected') {
          setStripe({ kind: 'not_connected' });
        } else {
          setStripe({
            kind:            j.status,
            accountId:       j.accountId,
            chargesEnabled:  !!j.chargesEnabled,
            payoutsEnabled:  !!j.payoutsEnabled,
            dueCount:        j.dueCount ?? 0,
            defaultCurrency: j.defaultCurrency ?? null,
          });
        }
      } catch (err) {
        if (!cancelled) setStripe({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' });
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, initialStripeAccountId]);

  const handleStripeAction = async () => {
    setBusy('stripe');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Pre-flight: bare "Bearer " (empty token) trips the API into a 401
      // with no surface in the toast. Bail early with a clean message so
      // the streamer knows to reconnect rather than seeing an opaque
      // "Stripe link failed (401)".
      if (!session?.access_token) {
        throw new Error('Sign in expired. Reload the page to reconnect.');
      }
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) throw new Error(j?.error || `Stripe link failed (${res.status})`);
      // Both onboarding and "manage" land in Stripe-hosted flows. Same
      // window — Stripe's return_url brings them back to /profile/edit.
      window.location.href = j.url;
    } catch (err) {
      console.error('[PayoutsSection] Stripe action failed', err);
      setStripe((s) => (s.kind === 'loading' || s.kind === 'not_connected'
        ? { kind: 'error', message: err instanceof Error ? err.message : 'Stripe link failed' }
        : s));
      setBusy(null);
    }
  };

  // Probe whether the currently-saved wallet has completed on-chain
  // registration — covers both a fresh page load and a wallet saved before
  // this check existed. `deriveRegistryPda`/getAccountInfo only, no wallet
  // interaction needed to just check.
  useEffect(() => {
    let cancelled = false;
    if (!savedWallet) { setRegistered(null); return; }
    (async () => {
      try {
        const { deriveRegistryPda } = await import('@/lib/casi-escrow');
        const [registryPda] = deriveRegistryPda(new PublicKey(savedWallet));
        const info = await connection.getAccountInfo(registryPda);
        if (!cancelled) setRegistered(!!info);
      } catch {
        // RPC hiccup — leave as unknown rather than falsely claiming either
        // state; the retry action below re-checks via registerOnChain anyway.
        if (!cancelled) setRegistered(null);
      }
    })();
    return () => { cancelled = true; };
  }, [savedWallet, connection]);

  // Signs + submits register_streamer from the connected wallet. Required
  // before initialize_escrow will let any viewer target this streamer — see
  // docs/fable-security-review-2026-08-10.md Finding 4. Best-effort: a
  // failure here doesn't undo the DB-side wallet save (mirrors
  // DelegateKeyCard's needs-finalize pattern) — the card below shows a clear
  // retry action instead of silently leaving Solana bookings broken.
  const registerOnChain = async (): Promise<boolean> => {
    if (!wallet.publicKey || !wallet.signTransaction) return false;
    setBusy('register');
    try {
      const { CasiEscrowClient } = await import('@/lib/casi-escrow');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anchorWallet: any = {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions:
          wallet.signAllTransactions ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (async (txs: any[]) => {
            const out = [];
            for (const tx of txs) out.push(await wallet.signTransaction!(tx));
            return out;
          }),
      };
      const client = new CasiEscrowClient(connection, anchorWallet, WALLET_ADAPTER_CLUSTER);
      await client.registerStreamer();
      setRegistered(true);
      setWalletErr(null);
      return true;
    } catch (err) {
      setWalletErr(err instanceof Error ? err.message : 'On-chain registration failed');
      setRegistered(false);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleLinkWallet = async () => {
    setWalletErr(null);
    if (!wallet.publicKey) {
      // Adapter modal — picks Phantom / Solflare / etc.
      setWalletModalVisible(true);
      return;
    }
    setBusy('wallet');
    try {
      const pk = wallet.publicKey.toBase58();
      const { error } = await supabase
        .from('profiles')
        .update({ solana_wallet: pk })
        .eq('id', profileId);
      if (error) throw error;
      setSavedWallet(pk);
    } catch (err) {
      setWalletErr(err instanceof Error ? err.message : 'Save failed');
      setBusy(null);
      return;
    }
    setBusy(null);
    // Same wallet is still connected — finish the on-chain half right away
    // rather than making this a second, separate trip to Settings.
    await registerOnChain();
  };

  // ── Card renderers ───────────────────────────────────────────────────────
  const stripeCard = (() => {
    if (stripe.kind === 'loading') {
      return (
        <ConnectedCard
          logo={STRIPE_LOGO}
          title="Stripe ·checking…"
          meta={<><StatusDot kind="off" />loading account status</>}
          action={null}
        />
      );
    }
    if (stripe.kind === 'not_connected') {
      return (
        <ConnectedCard
          logo={STRIPE_LOGO}
          title="Stripe ·not connected"
          meta={<><StatusDot kind="off" />card payments + EUR payouts</>}
          action={
            <GhostButton type="button" onClick={handleStripeAction} disabled={busy === 'stripe'}>
              {busy === 'stripe' ? 'Opening…' : 'Connect →'}
            </GhostButton>
          }
        />
      );
    }
    if (stripe.kind === 'error') {
      return (
        <ConnectedCard
          logo={STRIPE_LOGO}
          title="Stripe ·status unavailable"
          // Wrap the meta line so streamers actually see the full Stripe
          // error message (typically a sentence ending in a dashboard URL
          // that they need to click). Linkify any URL in the message.
          wrapMeta
          meta={
            <>
              <StatusDot kind="warn" />
              <MessageWithLinks text={stripe.message} />
            </>
          }
          action={
            <GhostButton type="button" onClick={handleStripeAction} disabled={busy === 'stripe'}>
              {busy === 'stripe' ? 'Opening…' : 'Manage'}
            </GhostButton>
          }
        />
      );
    }
    // pending / active / restricted
    const dot: 'ok' | 'warn' = stripe.kind === 'active' ? 'ok' : 'warn';
    const label =
      stripe.kind === 'active'     ? `${shortAcct(stripe.accountId)} · ${stripe.defaultCurrency?.toUpperCase() ?? 'EUR'} · payouts on`
      : stripe.kind === 'restricted' ? `${shortAcct(stripe.accountId)} · review required`
      :                                `${shortAcct(stripe.accountId)} · ${stripe.dueCount} step${stripe.dueCount === 1 ? '' : 's'} remaining`;
    const title =
      stripe.kind === 'active'     ? 'Stripe ·connected'
      : stripe.kind === 'restricted' ? 'Stripe ·restricted'
      :                                'Stripe ·onboarding incomplete';
    return (
      <ConnectedCard
        logo={STRIPE_LOGO}
        title={title}
        meta={<><StatusDot kind={dot} />{label}</>}
        action={
          <GhostButton type="button" onClick={handleStripeAction} disabled={busy === 'stripe'}>
            {busy === 'stripe' ? 'Opening…' : stripe.kind === 'active' ? 'Manage' : 'Resume →'}
          </GhostButton>
        }
      />
    );
  })();

  const walletCard = (() => {
    const connected = wallet.publicKey?.toBase58() ?? null;
    const matchesSaved = !!connected && !!savedWallet && connected === savedWallet;

    // registered === false means the on-chain probe positively confirmed
    // this wallet has NOT completed register_streamer — without it, every
    // Solana booking targeting this streamer fails on-chain, silently, no
    // matter how correct everything else is. null (still checking, or an
    // RPC hiccup) intentionally falls through to the normal "linked" card
    // rather than flashing a false warning.
    if (savedWallet && matchesSaved && registered === false) {
      return (
        <ConnectedCard
          logo={SOLANA_LOGO}
          title="Solana wallet ·setup incomplete"
          meta={<><StatusDot kind="warn" />{shortPk(savedWallet)} · one more signature needed to receive Solana payments</>}
          action={
            <GhostButton type="button" onClick={registerOnChain} disabled={busy === 'register'}>
              {busy === 'register' ? 'Signing…' : 'Finish setup →'}
            </GhostButton>
          }
        />
      );
    }
    if (savedWallet && matchesSaved) {
      return (
        <ConnectedCard
          logo={SOLANA_LOGO}
          title="Solana wallet ·linked"
          meta={<><StatusDot kind="ok" />{shortPk(savedWallet)} · USDC auto-claim on</>}
          action={
            <GhostButton type="button" onClick={() => setWalletModalVisible(true)}>
              Replace
            </GhostButton>
          }
        />
      );
    }
    if (savedWallet && !connected) {
      return (
        <ConnectedCard
          logo={SOLANA_LOGO}
          title="Solana wallet ·linked (not connected)"
          meta={<><StatusDot kind="warn" />{shortPk(savedWallet)} · connect wallet to sign</>}
          action={
            <GhostButton type="button" onClick={() => setWalletModalVisible(true)}>
              Connect
            </GhostButton>
          }
        />
      );
    }
    if (savedWallet && connected && !matchesSaved) {
      return (
        <ConnectedCard
          logo={SOLANA_LOGO}
          title="Solana wallet ·different wallet connected"
          meta={<><StatusDot kind="warn" />saved {shortPk(savedWallet)} · connected {shortPk(connected)}</>}
          action={
            <GhostButton type="button" onClick={handleLinkWallet} disabled={busy === 'wallet'}>
              {busy === 'wallet' ? 'Saving…' : 'Replace'}
            </GhostButton>
          }
        />
      );
    }
    // No saved wallet
    if (connected) {
      return (
        <ConnectedCard
          logo={SOLANA_LOGO}
          title="Solana wallet ·ready to link"
          meta={<><StatusDot kind="warn" />{shortPk(connected)} · save to receive USDC tips</>}
          action={
            <GhostButton type="button" onClick={handleLinkWallet} disabled={busy === 'wallet'}>
              {busy === 'wallet' ? 'Saving…' : 'Save'}
            </GhostButton>
          }
        />
      );
    }
    return (
      <ConnectedCard
        logo={SOLANA_LOGO}
        title="Solana wallet ·not linked"
        meta={<><StatusDot kind="off" />USDC tips + escrow refunds</>}
        action={
          <GhostButton type="button" onClick={handleLinkWallet}>
            Connect →
          </GhostButton>
        }
      />
    );
  })();

  return (
    <SettingsSection
      id="payouts"
      title="Payouts"
      desc="Casi takes 0%. Cards settle through Stripe (Stripe's own fee ~2.9% + €0.25 per tip). USDC hits your wallet on settle, near-zero on-chain fees."
    >
      <div
        className="mb-3.5 flex items-start gap-3"
        style={{
          background: 'color-mix(in oklab, var(--ink) 6%, var(--paper))',
          border: '1px solid color-mix(in oklab, var(--ink) 18%, var(--paper))',
          borderRadius: 'var(--radius-row)',
          padding: '14px 16px',
        }}
      >
        <div style={{ fontFamily: 'var(--S)', fontSize: '15px', lineHeight: 1.5, color: 'var(--text-2)' }}>
          <strong style={{ fontFamily: 'var(--B)', fontStyle: 'normal', fontWeight: 700, color: 'var(--text)' }}>
            Casi never holds your money.
          </strong>{' '}
          Card payments flow directly to your Stripe account. USDC sits in an on-chain escrow contract
          (open-source) and pays out to your wallet. We&apos;re software, not a bank.
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {stripeCard}
        {walletCard}
      </div>

      {walletErr && (
        <div
          className="mt-2"
          style={{ fontFamily: 'var(--M)', fontSize: '12px', color: '#ef4444' }}
        >
          ✕ {walletErr}
        </div>
      )}
    </SettingsSection>
  );
}
