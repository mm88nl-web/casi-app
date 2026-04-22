"use client";
/**
 * SendFlashSection
 *
 * Viewer-facing form to send a Flash (one-time paid chat message).
 * Supports three rails via PaymentManager:
 *   - stripe  — always available if the streamer has a connected Stripe account
 *   - solana  — gated on NEXT_PUBLIC_CASI_SOLANA_ENABLED (devnet-only indefinitely)
 *   - free    — gated on profile.allow_free_flashes; 1/minute rate-limited server-side
 *
 * Extracted from overlay/page.tsx as part of the Phase-1 tidy-up — the page
 * used to carry the whole form inline (~300 lines).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { createClient } from '@/utils/supabase/client';
import { sendFlash, SOLANA_ENABLED, type PaymentMethod } from '@/lib/payment-manager';
import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';
import { TurnstileWidget } from '@/components/TurnstileWidget';

// Minimal shape of the streamer profile we actually read.
interface StreamerProfileLite {
  solana_wallet?: string | null;
  allow_free_flashes?: boolean | null;
}

// Matching the old `myFlash` shape returned by Supabase realtime.
interface MyFlashRow {
  status: 'pending' | 'approved' | 'denied';
  viewer_name?: string;
  tx_signature?: string | null;
}

interface Props {
  profileId: string;
  username: string;
  viewerName: string;
  showNotif: (text: string, type: string) => void;
  profile: StreamerProfileLite;
  /**
   * Render the composer body directly, skipping the collapsed "Send a Flash"
   * summary card + open/close header. Used by ChatPanel when tip-mode is
   * active so the flash composer sits inline with the chat input.
   */
  embedded?: boolean;
  /** Fires after a successful send — caller can collapse tip-mode, clear UI, etc. */
  onSent?: () => void;
}

const AMOUNT_PRESETS = [2, 5, 10, 20];

export default function SendFlashSection({
  profileId, username, viewerName, showNotif, profile, embedded = false, onSent,
}: Props) {
  // Collapsed by default in standalone mode; forced open in embedded mode
  // since the caller controls visibility.
  const [open, setOpen] = useState(embedded);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [myFlash, setMyFlash] = useState<MyFlashRow | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [onChainStatus, setOnChainStatus] = useState<null | 'locking' | 'locked'>(null);
  const [onChainTx, setOnChainTx] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const onTurnstileVerify = useCallback((t: string) => setTurnstileToken(t), []);
  const onTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const supabase = useRef(createClient()).current;

  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const freeAllowed   = !!profile?.allow_free_flashes;
  const solanaAllowed = SOLANA_ENABLED && !!profile?.solana_wallet;

  // If the current selection becomes unavailable (e.g. toggle off), fall back to stripe.
  useEffect(() => {
    if (paymentMethod === 'solana' && !solanaAllowed) setPaymentMethod('stripe');
    if (paymentMethod === 'free'   && !freeAllowed)   setPaymentMethod('stripe');
  }, [paymentMethod, solanaAllowed, freeAllowed]);

  // Realtime subscription — keep `myFlash` in sync with this viewer's latest row.
  useEffect(() => {
    if (!viewerName || !profileId) return;
    const channel = supabase
      .channel(`my_flashes_${profileId}_${viewerName}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'flashes',
        filter: `profile_id=eq.${profileId}`,
      }, (payload) => {
        const row = payload.new as MyFlashRow | undefined;
        if (row?.viewer_name === viewerName) {
          setMyFlash(row);
          if (row.status === 'approved') showNotif('⚡ Your flash is live on stream!', 'success');
          if (row.status === 'denied')   showNotif('Flash was not approved — no charge.', 'denied');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, viewerName, supabase, showNotif]);

  const amountCents = Math.round(parseFloat(amount || '0') * 100);
  const amountUsdc  = Math.round(parseFloat(amount || '0') * 1_000_000);
  const solanaReady =
    paymentMethod !== 'solana' ||
    (connected && !!publicKey && !!signTransaction && !!profile?.solana_wallet);

  const canSend =
    !submitting &&
    message.trim().length > 0 &&
    (paymentMethod === 'free' ? !!turnstileToken : amountCents >= 100 && !isNaN(amountCents)) &&
    solanaReady;

  const handleSend = async () => {
    if (!canSend) return;
    setSubmitting(true);
    setOnChainStatus(null);
    setOnChainTx(null);
    try {
      if (paymentMethod === 'solana') setOnChainStatus('locking');

      const result = await sendFlash({
        method: paymentMethod,
        profileId, viewerName,
        message: message.trim(),
        amountCents: paymentMethod === 'free' ? 0 : amountCents,
        amountUsdc,
        streamerSolanaWallet: profile?.solana_wallet ?? null,
        solana: paymentMethod === 'solana'
          ? { connection, wallet: { publicKey, signTransaction, signAllTransactions } }
          : undefined,
        turnstileToken: turnstileToken ?? undefined,
      });

      if (result.redirectTo) {
        window.location.href = result.redirectTo;
        return; // Don't clear submitting — page is navigating
      }
      if (result.solana) {
        setOnChainTx(result.solana.sig);
        setOnChainStatus('locked');
        showNotif(`⚡ Flash locked on-chain — awaiting approval · ↗ ${result.solana.solscanUrl}`, 'success');
      }
      if (paymentMethod === 'free') {
        showNotif('⚡ Free flash sent — awaiting approval', 'success');
        setMessage('');
      }
      // Let the parent react to a successful send (e.g. ChatPanel collapses
      // tip-mode back to the regular chat composer). Only fires on the
      // non-redirecting paths — Stripe's redirect exits via window.location.
      onSent?.();
    } catch (err: unknown) {
      const { formatEscrowError } = await import('@/lib/casi-errors');
      showNotif(formatEscrowError(err), 'denied');
      setOnChainStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Available methods in the order they render.
  const methods: PaymentMethod[] = ['stripe'];
  if (solanaAllowed) methods.push('solana');
  if (freeAllowed)   methods.push('free');

  // Embedded mode: strip the outer margin + the collapsed-summary / header
  // chrome. The caller (ChatPanel) owns the "am I showing the flash
  // composer right now?" decision and its own close affordance.
  const containerStyle: React.CSSProperties = embedded
    ? { background: 'transparent', padding: 0 }
    : { marginTop: 20 };
  const bodyStyle: React.CSSProperties = embedded
    ? { padding: '12px 14px', background: 'rgba(var(--casi-accent-rgb),0.04)', border: '1px solid rgba(var(--casi-accent-rgb),0.14)', borderRadius: 10, animation: 'fadeIn .2s ease' }
    : { background: 'var(--casi-surface)', border: '1px solid rgba(var(--casi-accent-rgb),0.14)', borderRadius: 14, padding: 20, animation: 'fadeIn .25s ease' };

  return (
    <div style={containerStyle}>
      {!embedded && !open ? (
        <button onClick={() => setOpen(true)}
          style={{ width: '100%', background: 'rgba(var(--casi-accent-rgb),0.06)', border: '1px solid rgba(var(--casi-accent-rgb),0.14)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'background .2s' }}
          onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--casi-accent-rgb),0.1)')}
          onMouseOut={e => (e.currentTarget.style.background = 'rgba(var(--casi-accent-rgb),0.06)')}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--casi-text)' }}>Send a Flash</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)', marginTop: 2 }}>
              {freeAllowed ? 'Free or paid message · shown live on stream' : 'One-time paid message · shown live on stream'}
            </div>
          </div>
          <span style={{ marginLeft: 'auto', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>→</span>
        </button>
      ) : (
        <div style={bodyStyle}>
          {/* Header — standalone mode shows the big "Send a Flash" title +
              close button. Embedded mode hides it; ChatPanel owns its own
              header/close affordance. */}
          {!embedded && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-accent)', marginBottom: 3 }}>⚡ Flash</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 800, color: 'var(--casi-text)' }}>Send a Flash</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--casi-text-muted)', cursor: 'pointer', fontSize: 18, padding: 4 }}>✕</button>
          </div>
          )}

          {/* Live status feedback */}
          {myFlash?.status === 'approved' && (
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4ade80', animation: 'springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              ✓ Your flash is live on stream!
              {myFlash.tx_signature && (
                <a href={`https://solscan.io/tx/${myFlash.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: 4, fontSize: 9, color: '#9945FF', textDecoration: 'none', opacity: 0.8 }}>
                  ↗ verify on Solscan
                </a>
              )}
            </div>
          )}
          {myFlash?.status === 'denied' && (
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#f87171', animation: 'springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              ✕ Flash was not approved — no charge.
            </div>
          )}
          {myFlash?.status === 'pending' && (
            <div style={{ background: 'rgba(var(--casi-accent-rgb),0.06)', border: '1px solid rgba(var(--casi-accent-rgb),0.18)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-accent)', animation: 'blink 2s infinite' }}>
              ⌛ Flash sent — awaiting streamer approval
            </div>
          )}

          {/* On-chain banners */}
          {onChainStatus === 'locking' && (
            <div style={{ background: 'rgba(153,69,255,0.08)', border: '1px solid rgba(153,69,255,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#c4a0ff', animation: 'springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              ⛓ Locking USDC in escrow — confirm in your wallet…
            </div>
          )}
          {onChainStatus === 'locked' && onChainTx && (
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4ade80', animation: 'springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              ⚡ Flash locked on-chain — awaiting streamer approval
              <a href={`https://solscan.io/tx/${onChainTx}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', marginTop: 4, fontSize: 9, color: '#9945FF', textDecoration: 'none', opacity: 0.8 }}>
                ↗ verify on Solscan
              </a>
            </div>
          )}

          {/* Payment method toggle — only shown if more than one rail is available */}
          {methods.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', display: 'block', marginBottom: 8 }}>Pay with</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {methods.map(pm => {
                  const active = paymentMethod === pm;
                  const label = pm === 'stripe' ? '💳 Card' : pm === 'solana' ? '◎ Solana' : '★ Free';
                  const activeStyle =
                    pm === 'solana' ? { background: 'rgba(153,69,255,0.12)', borderColor: 'rgba(153,69,255,0.45)', color: '#c4a0ff' } :
                    pm === 'free'   ? { background: 'rgba(74,222,128,0.12)',  borderColor: 'rgba(74,222,128,0.4)',  color: '#4ade80' } :
                                       { background: 'rgba(var(--casi-accent-rgb),0.12)', borderColor: 'rgba(var(--casi-accent-rgb),0.45)', color: 'var(--casi-accent)' };
                  return (
                    <button key={pm} type="button" onClick={() => setPaymentMethod(pm)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid', fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', transition: 'all .2s cubic-bezier(0.34,1.56,0.64,1)',
                        ...(active ? { ...activeStyle, transform: 'scale(1.02)' } : { background: 'none', borderColor: 'var(--casi-border)', color: 'var(--casi-text-muted)', transform: 'scale(1)' }) }}>
                      {label}
                    </button>
                  );
                })}
              </div>
              {paymentMethod === 'solana' && !profile?.solana_wallet && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#f87171', marginTop: 6 }}>
                  @{username} hasn&apos;t linked a Solana wallet yet.
                </div>
              )}
              {paymentMethod === 'solana' && profile?.solana_wallet && !connected && (
                <button type="button" onClick={() => setWalletModalVisible(true)}
                  style={{ width: '100%', marginTop: 8, background: 'rgba(153,69,255,0.1)', border: '1px solid rgba(153,69,255,0.35)', borderRadius: 8, padding: '8px 0', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#c4a0ff', cursor: 'pointer' }}>
                  Connect wallet to continue
                </button>
              )}
            </div>
          )}

          {/* Message */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', display: 'block', marginBottom: 8 }}>Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={200} rows={3}
              placeholder="Say something to the stream…"
              className="bf-inp" style={{ resize: 'none' }} />
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#333', marginTop: 4, textAlign: 'right' }}>{message.length}/200</div>
          </div>

          {/* Amount — hidden entirely for the free rail */}
          {paymentMethod !== 'free' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', display: 'block', marginBottom: 8 }}>
                Amount {paymentMethod === 'solana' ? '(USDC)' : '(EUR)'}
              </label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {AMOUNT_PRESETS.map(p => (
                  <button key={p} type="button" onClick={() => setAmount(String(p))}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid', fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      ...(parseFloat(amount) === p
                        ? { background: 'rgba(var(--casi-accent-rgb),0.12)', borderColor: 'rgba(var(--casi-accent-rgb),0.35)', color: 'var(--casi-accent)' }
                        : { background: 'none', borderColor: 'var(--casi-border)', color: 'var(--casi-text-muted)' }) }}>
                    {paymentMethod === 'solana' ? `${p} USDC` : `$${p}`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--casi-text-muted)' }}>
                  {paymentMethod === 'solana' ? '◎' : '$'}
                </span>
                <input type="number" value={amount} min="1" step="1" onChange={e => setAmount(e.target.value)}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 17, fontWeight: 700, color: 'var(--casi-text)', fontFamily: "'Syne', sans-serif" }} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#333', whiteSpace: 'nowrap' }}>
                  {paymentMethod === 'solana' ? 'min 1 USDC' : 'min $1'}
                </span>
              </div>
            </div>
          )}

          {/* Captcha — only needed for free rail */}
          {paymentMethod === 'free' && (
            <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
              <TurnstileWidget
                onVerify={onTurnstileVerify}
                onExpire={onTurnstileExpire}
                theme="dark"
                compact
              />
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSend} disabled={!canSend}
            style={{ width: '100%',
              background: canSend
                ? (paymentMethod === 'solana' ? '#9945FF' : paymentMethod === 'free' ? '#4ade80' : 'var(--casi-accent)')
                : 'var(--casi-border)',
              border: 'none', borderRadius: 10, padding: '13px 0', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.3,
              color: canSend
                ? (paymentMethod === 'solana' ? '#fff' : '#050505')
                : '#444',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all .2s' }}>
            <svg width="14" height="11" viewBox="0 0 14 11" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="13" height="10" rx="1.5" stroke="currentColor" strokeOpacity="0.6"/>
              <rect x="0" y="3" width="14" height="2.5" fill="currentColor" fillOpacity="0.5"/>
              <rect x="2" y="7" width="4" height="1.5" rx="0.5" fill="currentColor"/>
            </svg>
            {paymentMethod === 'solana'
              ? (submitting ? (onChainStatus === 'locking' ? 'Locking on-chain…' : 'Submitting…') : `Lock ${(amountCents / 100).toFixed(2)} USDC & Flash`)
              : paymentMethod === 'free'
                ? (submitting ? 'Sending…' : 'Send Free Flash')
                : (submitting ? 'Redirecting…' : `Pay $${(amountCents / 100).toFixed(2)} & Flash`)}
          </button>

          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#2a2a2a', textAlign: 'center', marginTop: 10, lineHeight: 1.9 }}>
            {paymentMethod === 'solana'
              ? <>USDC held in a CASI escrow PDA · Refunded on deny · <span style={{ color:'#9945FF' }}>audited Anchor program</span><br /></>
              : paymentMethod === 'free'
                ? <>Free message · 1 per minute · streamer can deny or approve<br /></>
                : <>Payment held until streamer approves · Fully refunded if denied<br /></>}
            {paymentMethod !== 'free' && (
              <span style={{ color: '#444' }}>100% → @{username} · no platform fee</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
