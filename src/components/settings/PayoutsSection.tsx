'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
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
        background: 'var(--surf, var(--casi-bg))',
        border: '1px solid var(--line-2, var(--casi-border-2))',
        borderRadius: 0,
      }}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {logo}
        <div className="min-w-0">
          <div
            className="font-semibold"
            style={{
              fontFamily: 'var(--B), var(--font-casi-sans), sans-serif',
              fontSize: '14px',
              color: 'var(--text, var(--casi-text))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div
            className="mt-0.5 font-mono uppercase"
            style={{
              fontFamily: 'var(--M), var(--font-casi-mono), monospace',
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: 'var(--text-3, var(--casi-text-dim))',
              overflow: wrapMeta ? 'visible' : 'hidden',
              textOverflow: wrapMeta ? 'clip' : 'ellipsis',
              whiteSpace: wrapMeta ? 'normal' : 'nowrap',
              lineHeight: wrapMeta ? 1.45 : undefined,
              textTransform: wrapMeta ? 'none' : undefined,
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
      width: '40px',
      height: '40px',
      borderRadius: 0,
      background: 'var(--surf-2, var(--ink-04))',
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
      width: '40px',
      height: '40px',
      borderRadius: 0,
      background: 'var(--surf-2, var(--ink-04))',
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
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [stripe, setStripe] = useState<StripeStatus>(
    initialStripeAccountId ? { kind: 'loading' } : { kind: 'not_connected' },
  );
  const [savedWallet, setSavedWallet] = useState<string | null>(initialSolanaWallet);
  const [busy, setBusy] = useState<'stripe' | 'wallet' | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);

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
    } finally {
      setBusy(null);
    }
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
          background: 'var(--ink-04)',
          border: '1px solid var(--ink-22)',
          borderRadius: 0,
          padding: '12px 14px',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center font-mono font-semibold"
          style={{
            width: '22px',
            height: '22px',
            borderRadius: 0,
            background: 'var(--ink-14)',
            color: 'var(--ink, var(--casi-accent2))',
            fontSize: '12px',
            marginTop: '1px',
          }}
        >
          ♦
        </div>
        <div style={{ fontFamily: 'var(--B), var(--font-casi-sans), sans-serif', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--text-3, var(--casi-text-mid))' }}>
          <strong style={{ color: 'var(--text, var(--casi-text))' }}>
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
          className="mt-2 font-mono"
          style={{ fontSize: '10px', color: '#ef4444' }}
        >
          ✕ {walletErr}
        </div>
      )}
    </SettingsSection>
  );
}
