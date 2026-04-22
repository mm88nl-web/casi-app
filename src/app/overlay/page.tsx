"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import SkinProvider from '@/components/SkinProvider';
import WalletNav, { refreshWalletNav } from '@/components/WalletNav';
import SlotMedia from '@/components/SlotMedia';
import { useWalletBalances } from '@/lib/wallet-balances';
import { BANNER_MAX_MESSAGE } from '@/lib/banner';
import FlashPanel from '@/components/FlashPanel';
import TurnstileWidget from '@/components/TurnstileWidget';
import {
  SOLANA_RPC,
  USDC_MINT,
  EXPLORER_CLUSTER_QUERY,
  IS_MAINNET,
  WALLET_ADAPTER_CLUSTER,
} from '@/lib/solana-network';

// Explicit column list for bookings reads. Belt + suspenders alongside the
// column-level GRANT in 20260423 — if a new sensitive column lands on
// bookings and someone forgets to update the REVOKE/GRANT list, clients
// here still only ask for known columns.
const BOOKING_COLS = 'id, created_at, profile_id, element_id, viewer_name, status, image_url, storage_path, file_type, message, duration_minutes, price_value, price_unit, payment_method, tx_signature, payment_intent_id, original_amount_cents, approved_at, started_at, escrow_pda, viewer_wallet, is_queued, queue_position';
const BOOKING_PAGE_LIMIT = 200;

function Logo({ scale = 0.32, color = 'var(--casi-accent)', bg = 'var(--casi-bg)' }: { scale?: number; color?: string; bg?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width={400 * scale} height={200 * scale}>
      <g stroke={color} fill={color} strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path fill={color} stroke="none" d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z" />
      <circle fill={bg} cx="200" cy="100" r="45" />
    </svg>
  );
}

function getSecondsRemaining(booking: any): number {
  if (!booking?.started_at || !booking?.duration_minutes) return 0;
  const started = new Date(booking.started_at).getTime();
  // Explicit Number() coercion: Postgres NUMERIC columns return as strings via PostgREST
  const expiresAt = started + Number(booking.duration_minutes) * 60 * 1000;
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}
function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function Countdown({ booking, onWarning, onExpire }: { booking: any; onWarning?: (s: number) => void; onExpire?: () => void }) {
  const [seconds, setSeconds] = useState(getSecondsRemaining(booking));
  const firedRef = useRef(false);
  useEffect(() => {
    firedRef.current = false;
    const interval = setInterval(() => {
      const s = getSecondsRemaining(booking);
      setSeconds(s);
      if (onWarning) onWarning(s);
      if (s <= 0 && onExpire && !firedRef.current) {
        firedRef.current = true;
        onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [booking, onWarning, onExpire]);
  return <span>{formatTime(seconds)}</span>;
}

const VIEWER_NAME_KEY = 'casi_viewer_name';
// Per-booking cancel_tokens keyed by booking_id. Stored here so the viewer
// (who is anonymous) can later prove ownership to /api/stripe/cancel without
// relying on the publicly-readable viewer_name column.
const BOOKING_TOKENS_KEY = 'casi_booking_tokens';
function readBookingTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BOOKING_TOKENS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function rememberBookingToken(bookingId: string, token: string) {
  try {
    const map = readBookingTokens();
    map[bookingId] = token;
    localStorage.setItem(BOOKING_TOKENS_KEY, JSON.stringify(map));
  } catch {}
}
function forgetBookingToken(bookingId: string) {
  try {
    const map = readBookingTokens();
    delete map[bookingId];
    localStorage.setItem(BOOKING_TOKENS_KEY, JSON.stringify(map));
  } catch {}
}
const ADJECTIVES = ['Cool','Fast','Bold','Wild','Epic','Slick','Dark','Neon','Hyper','Ultra','Turbo','Mega','Swift','Storm','Blaze'];
const ANIMALS    = ['Tiger','Panda','Fox','Wolf','Hawk','Bear','Shark','Eagle','Viper','Lynx','Raven','Cobra','Falcon','Bison','Orca'];
function generateRandomName() {
  const adj    = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}${animal}${Math.floor(Math.random() * 99) + 1}`;
}

function NameEntryScreen({ onConfirm, tc }: { onConfirm: (name: string) => void; tc: string }) {
  const [name, setName] = useState(generateRandomName());
  const [showNote, setShowNote] = useState(false);
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap'); *{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{ minHeight:'100vh', background:'var(--casi-bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:"'Syne',sans-serif" }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:40 }}>
            <Logo scale={0.5} color={tc} />
            <div style={{ fontSize:28, fontWeight:800, color:tc, letterSpacing:-1, marginTop:8 }}>casi</div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:3, textTransform:'uppercase', color:'#444', marginTop:4 }}>Viewer</div>
          </div>
          <div style={{ background:'var(--casi-surface)', border:'1px solid var(--casi-border)', borderRadius:16, padding:28, marginBottom:12 }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'var(--casi-text-muted)', marginBottom:16 }}>Pick a name for this stream</div>
            <div style={{ position:'relative', marginBottom:8 }}>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key==='Enter' && name.trim() && onConfirm(name.trim())}
                maxLength={24} autoFocus
                style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid var(--casi-border)', borderRadius:10, padding:'13px 16px', paddingRight:90, fontSize:15, fontWeight:700, color:'var(--casi-text)', outline:'none', fontFamily:"'Syne',sans-serif" }}
                onFocus={(e)=>e.target.style.borderColor='rgba(var(--casi-accent-rgb),0.38)'}
                onBlur={(e)=>e.target.style.borderColor='var(--casi-border)'} />
              <button onClick={() => setName(generateRandomName())}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontFamily:"'DM Mono',monospace", fontSize:10, color:'#555', cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>
                ↺ random
              </button>
            </div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#333', marginBottom:20 }}>A random name was generated — change it or keep it.</div>
            <button onClick={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()}
              style={{ width:'100%', background:name.trim()?tc:'var(--casi-border)', border:'none', borderRadius:10, padding:14, fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, textTransform:'uppercase', letterSpacing:0.5, color:'var(--casi-bg)', cursor:name.trim()?'pointer':'not-allowed', transition:'all .2s' }}>
              Enter stream →
            </button>
          </div>
          <button onClick={() => setShowNote(!showNote)}
            style={{ width:'100%', background:'none', border:'none', fontFamily:"'DM Mono',monospace", fontSize:10, color:'#333', cursor:'pointer', textTransform:'uppercase', letterSpacing:1.5, padding:'10px 0' }}>
            Have an account? Sign in
          </button>
          {showNote && (
            <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid #111', borderRadius:10, padding:16, textAlign:'center', marginTop:8 }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'#444', lineHeight:1.7 }}>Account sign-in coming soon.<br/>Your name is saved on this device for now.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type TxStatus = 'idle' | 'booking' | 'streaming' | 'waiting' | 'error';

function SolanaConfirmModal({ slot, duration, estimatedCost, username, recipientWallet, usdcBalance, txStatus, txError, txId, submitting, onConfirm, onCancel }: {
  slot: any; duration: number; estimatedCost: string; username: string;
  recipientWallet: string | null; usdcBalance: number | null;
  txStatus: TxStatus; txError: string | null; txId: string | null;
  submitting: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const hasInsufficient = usdcBalance !== null && usdcBalance < parseFloat(estimatedCost);
  const inProgress = submitting && txStatus !== 'idle' && txStatus !== 'error';
  const stepIcon = (active: boolean, done: boolean) => done ? '✓' : active ? '⟳' : '○';
  const shortWallet = recipientWallet
    ? `${recipientWallet.slice(0, 4)}…${recipientWallet.slice(-4)}`
    : null;
  const solscanUrl = txId
    ? `https://solscan.io/tx/${txId}${EXPLORER_CLUSTER_QUERY}`
    : null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'DM Mono',monospace" }}>
      <div style={{ background:'var(--casi-surface,#0d0d0d)', border:'1px solid rgba(153,69,255,0.35)', borderRadius:16, padding:28, width:'100%', maxWidth:380 }}>
        <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#9945FF', marginBottom:16 }}>Confirm your beam slot</div>

        {/* Details receipt */}
        <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
          {[['Slot on', `@${username}${IS_MAINNET ? '' : ' (devnet)'}`], ['Duration', formatTime(Math.round(duration * 60))], ['Rate', `$${slot.price_value}/${slot.price_unit}`]].map(([l, v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#666', marginBottom:6 }}>
              <span>{l}</span><span style={{ color:'#e8e8e8' }}>{v}</span>
            </div>
          ))}
          {shortWallet && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#666', marginBottom:6 }}>
              <span>Recipient</span>
              <span style={{ color:'#e8e8e8', fontFamily:"'DM Mono',monospace" }}>{shortWallet}</span>
            </div>
          )}
          <div style={{ borderTop:'1px solid #1c1c1c', margin:'10px 0' }} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#555', marginBottom:8 }}>
            <span>@{username} receives</span>
            <span style={{ color:'#e8e8e8' }}>{parseFloat(estimatedCost).toFixed(2)} USDC <span style={{ color:'#6ee7b7' }}>(100%)</span></span>
          </div>
          <div style={{ borderTop:'1px solid #1a1a1a', margin:'6px 0 8px' }} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#666' }}>
            <span>Total</span>
            <span style={{ fontSize:18, fontWeight:800, color:'#9945FF' }}>{estimatedCost} USDC</span>
          </div>
          {usdcBalance !== null && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:8 }}>
              <span style={{ color:'#555' }}>Your balance</span>
              <span style={{ color: hasInsufficient ? '#f87171' : '#6ee7b7' }}>
                {usdcBalance.toFixed(2)} USDC{hasInsufficient ? ' — insufficient' : ''}
              </span>
            </div>
          )}
        </div>

        {/* CASI escrow note + anti-phishing warning */}
        {!inProgress && txStatus !== 'waiting' && (
          <div style={{ fontSize:10, color:'#444', lineHeight:1.8, marginBottom:16 }}>
            Funds held in CASI on-chain escrow and vest over the beam duration.<br />
            Unused USDC returns if ended early.
            {shortWallet && (
              <>
                <br />
                <span style={{ color:'#facc15' }}>⚠ Verify recipient </span>
                <span style={{ color:'#666' }}>{shortWallet}</span>
                <span style={{ color:'#facc15' }}> in your wallet popup.</span>
              </>
            )}
          </div>
        )}

        {/* TX status steps */}
        {(inProgress || txStatus === 'waiting') && (
          <div style={{ background:'rgba(255,255,255,0.02)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
            {[
              { label: 'Booking created',             active: txStatus === 'booking',   done: txStatus !== 'booking' },
              { label: 'Funding CASI escrow…',        active: txStatus === 'streaming', done: txStatus === 'waiting' },
              { label: 'Waiting for admin approval',  active: txStatus === 'waiting',   done: false },
            ].map((step, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, fontSize:11,
                color: step.done ? '#6ee7b7' : step.active ? '#9945FF' : '#444',
                marginBottom: i < 2 ? 8 : 0 }}>
                <span style={{ width:14, textAlign:'center', display:'inline-block',
                  animation: step.active ? 'casi-blink 1.2s infinite' : 'none' }}>
                  {stepIcon(step.active, step.done)}
                </span>
                {step.label}
                {step.active && i === 2 && solscanUrl && (
                  <a href={solscanUrl} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft:'auto', fontSize:10, color:'#9945FF', textDecoration:'none', opacity:0.8 }}>
                    ↗ verify tx
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {txStatus === 'error' && txError && (
          <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:11, color:'#f87171' }}>
            {txError}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancel} disabled={inProgress}
            style={{ flex:1, background:'none', border:'1px solid #1c1c1c', borderRadius:10, padding:'12px 0', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13, color: inProgress ? '#333' : '#555', cursor: inProgress ? 'not-allowed' : 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={inProgress || hasInsufficient}
            style={{ flex:2, background: inProgress || hasInsufficient ? '#1c1c1c' : '#9945FF', border:'none', borderRadius:10, padding:'12px 0', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:13, color: inProgress || hasInsufficient ? '#444' : '#fff', cursor: inProgress || hasInsufficient ? 'not-allowed' : 'pointer' }}>
            {inProgress ? 'Signing…' : txStatus === 'error' ? 'Retry →' : 'Confirm & Sign →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Flash Feed (OBS overlay) ────────────────────────────────────────────── */
type FlashItem = { id: string; viewer_name: string; message: string; amount_cents: number; enteredAt: number; tx_signature?: string | null };

function FlashFeed({ profileId }: { profileId: string }) {
  const [items, setItems] = useState<FlashItem[]>([]);
  const supabase = useRef(createClient()).current;
  const DISPLAY_MS = 25_000;

  // Hydrate with any flashes approved in the last DISPLAY_MS on mount
  useEffect(() => {
    const since = new Date(Date.now() - DISPLAY_MS).toISOString();
    supabase
      .from('flashes')
      .select('id, viewer_name, message, amount_cents, tx_signature')
      .eq('profile_id', profileId)
      .eq('status', 'approved')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (data?.length) setItems(data.map(f => ({ ...f, enteredAt: Date.now() })));
      });
  }, [profileId, supabase]);

  // Real-time: listen for flashes being approved
  useEffect(() => {
    const channel = supabase
      .channel(`flash_feed_${profileId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        (payload) => {
          if (payload.new?.status === 'approved') {
            setItems(prev => {
              const n = payload.new as Record<string, unknown>;
              const item: FlashItem = {
                id:            n.id as string,
                viewer_name:   n.viewer_name as string,
                message:       n.message as string,
                amount_cents:  n.amount_cents as number,
                tx_signature:  n.tx_signature as string | null | undefined,
                enteredAt:     Date.now(),
              };
              return [...prev.filter(f => f.id !== item.id), item].slice(-5);
            });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, supabase]);

  // Auto-expire items after DISPLAY_MS
  useEffect(() => {
    const iv = setInterval(() => {
      setItems(prev => prev.filter(f => Date.now() - f.enteredAt < DISPLAY_MS));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  if (!items.length) return null;

  return (
    <div style={{ position: 'absolute', bottom: 28, right: 28, width: 290, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 200, pointerEvents: 'none' }}>
      <style>{`@keyframes flashPop{from{opacity:0;transform:scale(0.82) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      {items.map(flash => (
        <div key={flash.id} style={{ animation: 'flashPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
          {/* Name + amount row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, paddingLeft: 4 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, color: 'var(--casi-accent)', textShadow: '0 1px 6px rgba(0,0,0,0.9)', letterSpacing: 0.5 }}>
              ⚡ {flash.viewer_name}
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, background: 'rgba(var(--casi-accent-rgb),0.18)', color: 'var(--casi-accent)', border: '1px solid rgba(var(--casi-accent-rgb),0.35)', borderRadius: 20, padding: '1px 8px' }}>
              ${(flash.amount_cents / 100).toFixed(2)}
            </span>
          </div>
          {/* iMessage-style bubble */}
          <div style={{ background: 'rgba(255,255,255,0.93)', borderRadius: '18px 18px 4px 18px', padding: '11px 15px', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: '#0d0d0d', lineHeight: 1.45, margin: 0 }}>
              {flash.message}
            </p>
            {flash.tx_signature && (
              <a href={`https://solscan.io/tx/${flash.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#9945FF', textDecoration: 'none', opacity: 0.7, pointerEvents: 'auto' }}>
                ↗ verify on Solscan
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}


function OverlayContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('s') || '';
  const isOBS = searchParams.get('mode') === 'obs';

  const [elements, setElements]         = useState<any[]>([]);
  const [profile, setProfile]           = useState<any>(null);
  const [activeBookings, setActiveBookings]   = useState<any[]>([]);
  const [approvedQueuedBookings, setApprovedQueuedBookings] = useState<any[]>([]);
  const [queueCounts, setQueueCounts]   = useState<Record<string,number>>({});
  const [loading, setLoading]           = useState(true);
  const [myBookings, setMyBookings]     = useState<any[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<Set<string>>(new Set());
  const [savedViewerName, setSavedViewerName] = useState<string|null>(null);
  const [nameConfirmed, setNameConfirmed]     = useState(false);
  const [showChangeName, setShowChangeName]   = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [isQueue, setIsQueue]           = useState(false);
  const [isExtend, setIsExtend]         = useState(false);
  const [imageUrl, setImageUrl]         = useState('');
  const [imageValid, setImageValid]     = useState(false);
  const [message, setMessage]           = useState('');
  // durationSeconds is the canonical unit; duration_minutes = durationSeconds / 60
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [submitting, setSubmitting]     = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string|null>(null);
  const onTurnstileVerify = useCallback((t: string) => setTurnstileToken(t), []);
  const onTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const [cancelling, setCancelling]     = useState<string|null>(null);
  const [notification, setNotification] = useState<{text:string;type:string}|null>(null);
  // Pulled from the shared wallet-balance store (same source the top-right
  // WalletNav reads from, so the booking-form "Your balance" line and the
  // nav are guaranteed in lockstep). One WS sub + 10s poll for the whole app.
  const { usdc: usdcBalance } = useWalletBalances();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txStatus, setTxStatus]         = useState<TxStatus>('idle');
  const [txError, setTxError]           = useState<string|null>(null);
  const [confirmedTxId, setConfirmedTxId] = useState<string|null>(null);

  // ── Beam media (upload or URL) ────────────────────────────────────────────
  const [uploadMode, setUploadMode]         = useState<'url'|'upload'>('url');
  const [uploadedUrl, setUploadedUrl]       = useState<string|null>(null);
  const [uploadedPath, setUploadedPath]     = useState<string|null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<'image'|'video'|null>(null);
  const [uploading, setUploading]           = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Wallet state ──────────────────────────────────────────────────────────
  const { wallet, connected, connecting, connect, publicKey, signTransaction, signAllTransactions } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  // Only connect when the user explicitly clicked a Connect button.
  // Without this guard the effect fires on page load because Wallet Standard
  // registers Phantom into `wallet` automatically, causing an instant popup.
  const userInitiatedConnect = useRef(false);
  useEffect(() => {
    if (wallet && !connected && !connecting && userInitiatedConnect.current) {
      userInitiatedConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const openWalletModal = () => {
    userInitiatedConnect.current = true;
    if (wallet) {
      connect().catch(() => {});
    } else {
      setWalletModalVisible(true);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const supabase = useRef(createClient()).current;
  const viewerNameRef = useRef('');
  // Mirrors the connected wallet pubkey into a ref so loadData can pick up
  // cross-device denied rows (viewer_name lives in localStorage, wallet does
  // not). Updated by an effect below; reading via ref avoids reconstructing
  // the loadData callback on every wallet change.
  const viewerWalletRef = useRef<string | null>(null);
  const lastRealtimeEventAt = useRef(Date.now());

  // Theme color tokens — CSS vars, set by SkinProvider
  const tc    = 'var(--casi-accent)';
  const tcRgb = 'var(--casi-accent-rgb)';

  useEffect(() => {
    if (!isOBS && !username) window.location.href = '/search';
  }, [username, isOBS]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEWER_NAME_KEY);
      if (saved) { setSavedViewerName(saved); viewerNameRef.current = saved; setNameConfirmed(true); }
    } catch {}
  }, []);

  const confirmName = (name: string) => {
    try { localStorage.setItem(VIEWER_NAME_KEY, name); } catch {}
    setSavedViewerName(name); viewerNameRef.current = name; setNameConfirmed(true);
  };

  const showNotif = (text: string, type: string) => {
    setNotification({text, type});
    setTimeout(() => setNotification(null), 5000);
  };

  const loadData = useCallback(async (profId: string, nameOverride?: string) => {
    const name = nameOverride ?? viewerNameRef.current;
    const wallet = viewerWalletRef.current;
    const [{ data: els }, { data: active }, { data: aq }, { data: queued }] = await Promise.all([
      supabase.from('overlay_elements').select('*').eq('profile_id', profId),
      supabase.from('bookings').select(BOOKING_COLS).eq('profile_id', profId).eq('status','active').limit(BOOKING_PAGE_LIMIT),
      supabase.from('bookings').select(BOOKING_COLS).eq('profile_id', profId).eq('status','approved_queued').order('approved_at',{ascending:true}).limit(BOOKING_PAGE_LIMIT),
      supabase.from('bookings').select('element_id').eq('profile_id', profId).eq('status','pending').limit(BOOKING_PAGE_LIMIT),
    ]);
    // Viewer overlay: show backdrops + any slot with a defined price (0 == free).
    setElements((els||[]).filter((el:any) => el.is_background || el.price_value >= 0));
    setActiveBookings(active||[]);
    setApprovedQueuedBookings(aq||[]);
    const counts: Record<string,number> = {};
    (queued||[]).forEach((b:any) => { if (b.element_id) counts[b.element_id]=(counts[b.element_id]||0)+1; });
    setQueueCounts(counts);
    if (name || wallet) {
      // Load the viewer's active + recent rows. Denied rows are included so
      // the visibility filter at visibleMyBookings can surface "recover USDC"
      // for Solana bookings whose escrow PDA still holds funds. Without this,
      // a viewer who can't recover within the 30s grace window below is stuck.
      //
      // Two parallel queries, merged on id:
      //   - by viewer_name: the full recent set (pending / active / queued /
      //     denied / expired) for this browser's saved handle. `expired` is
      //     included so a kick whose on-chain settle silently failed still
      //     surfaces the RECOVER USDC chip — the DB says "done", the PDA still
      //     holds funds, and only the viewer can close it out.
      //   - by viewer_wallet: denied or expired Solana rows with a live escrow
      //     PDA, so a viewer who abandoned recovery on one device and
      //     reconnects the same wallet elsewhere still sees the chip. Scoped
      //     to payment_method=solana + non-null escrow_pda so we don't drag in
      //     unrelated history.
      const [nameRes, walletRes] = await Promise.all([
        name
          ? supabase.from('bookings').select(BOOKING_COLS)
              .eq('profile_id', profId).eq('viewer_name', name)
              .in('status', ['pending', 'active', 'approved_queued', 'denied', 'expired'])
              .order('created_at', { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] as any[] }),
        wallet
          ? supabase.from('bookings').select(BOOKING_COLS)
              .eq('profile_id', profId).eq('viewer_wallet', wallet)
              .eq('payment_method', 'solana')
              .in('status', ['denied', 'expired'])
              .not('escrow_pda', 'is', null)
              .limit(20)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const byId = new Map<any, any>();
      for (const b of (nameRes.data || [])) byId.set(b.id, b);
      for (const b of (walletRes.data || [])) if (!byId.has(b.id)) byId.set(b.id, b);
      const mine = Array.from(byId.values());
      // Keep a row around if it's still actionable. `denied` with live PDA =
      // recoverable via cancel_escrow; `expired` with live PDA = kick-leaked,
      // recoverable via settle_beam; recently-denied gives Stripe viewers a
      // moment to see the refund chip. Everything else drops out.
      const relevant = mine.filter((b:any) => {
        if (b.status === 'expired') {
          return b.payment_method === 'solana' && b.escrow_pda;
        }
        if (b.status === 'denied') {
          return (b.payment_method === 'solana' && b.escrow_pda)
            || Date.now() - new Date(b.created_at).getTime() < 30000;
        }
        return true;
      });
      setMyBookings(relevant);
    }
  }, [supabase]);

  // Keep viewerWalletRef in sync with the adapter, and re-pull bookings when
  // a wallet connects/disconnects. This is what lets a viewer open the page
  // on a brand-new browser/device, connect the same wallet, and see their
  // previously-denied Solana booking's RECOVER USDC chip — without this they
  // would be locked out until the 7-day cancel_stale_pending crank fires.
  useEffect(() => {
    const next = publicKey?.toBase58() ?? null;
    if (next === viewerWalletRef.current) return;
    viewerWalletRef.current = next;
    if (profile?.id) loadData(profile.id);
  }, [publicKey, profile?.id, loadData]);

  useEffect(() => {
    if (!username) return;
    let cleanup: (()=>void)|undefined;
    const init = async () => {
      const { data: prof } = await supabase.from('profiles').select('*').eq('username', username).single();
      setProfile(prof);
      if (prof) {
        const saved = (() => { try { return localStorage.getItem(VIEWER_NAME_KEY)||''; } catch { return ''; } })();
        viewerNameRef.current = saved;
        await loadData(prof.id, saved);
        setLoading(false);
        // Show success notification when returning from Stripe flash checkout
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          if (params.get('flash_success') === '1') {
            showNotif('⚡ Flash sent — awaiting streamer approval!', 'success');
            params.delete('flash_success');
            params.delete('flash_id');
            const qs = params.toString();
            window.history.replaceState({}, '', `${window.location.pathname}${qs ? '?' + qs : ''}`);
          }
        }
        const bump = () => { lastRealtimeEventAt.current = Date.now(); };
        const channel = supabase.channel(`overlay_${prof.id}`)
          .on('postgres_changes',{event:'*',schema:'public',table:'overlay_elements',filter:`profile_id=eq.${prof.id}`},()=>{bump();loadData(prof.id);})
          .on('postgres_changes',{event:'*',schema:'public',table:'bookings',filter:`profile_id=eq.${prof.id}`},(payload)=>{
            // TEMP diagnostic for deny-doesn't-propagate bug. Remove once fixed.
            console.warn('[overlay/rt/bookings]', {
              type: payload.eventType,
              oldStatus: (payload.old as { status?: string } | null)?.status,
              newStatus: (payload.new as { status?: string } | null)?.status,
              id: (payload.new as { id?: string | number } | null)?.id
                ?? (payload.old as { id?: string | number } | null)?.id,
            });
            bump();
            loadData(prof.id);
          })
          .subscribe((status) => {
            console.warn('[overlay/rt/subscribe]', status);
            if (status === 'SUBSCRIBED') bump();
          });

        // OBS heartbeat: if Realtime goes silent for 30 s, reload to reconnect
        let watchdog: ReturnType<typeof setInterval>|undefined;
        if (isOBS) {
          watchdog = setInterval(() => {
            if (Date.now() - lastRealtimeEventAt.current > 30_000) {
              window.location.reload();
            }
          }, 30_000);
        }

        cleanup = () => { supabase.removeChannel(channel); if (watchdog) clearInterval(watchdog); };
      } else { setLoading(false); }
    };
    init();
    return () => { if (cleanup) cleanup(); };
  }, [username, supabase, loadData]);

  const prevMyBookingsRef = useRef<any[]>([]);
  // Booking IDs that flipped to denied within the last minute. Used to keep
  // Stripe-denied chips on screen briefly ("✕ Denied — refund on the way")
  // since the viewer's payment is voided automatically and there's no button
  // to click. Solana-denied rows stay visible via the escrow_pda signal.
  const [recentlyDenied, setRecentlyDenied] = useState<Set<string>>(new Set());

  // 1. Status Change Notifications
  useEffect(() => {
    const prev = prevMyBookingsRef.current;
    myBookings.forEach(booking => {
      const old = prev.find((b: any) => b.id === booking.id);
      if (!old) return;
      if (old.status === 'pending' && booking.status === 'denied') {
        // Solana deny on a Pending escrow leaves funds in the PDA — only the
        // viewer can close it via cancel_escrow. We used to auto-pop the
        // wallet here, but Phantom doesn't reliably foreground popups when
        // the overlay tab isn't focused (streamer just denied, so attention
        // is on the admin tab), and a popup the viewer doesn't see = a
        // cancel tx that never lands. Point them at the persistent RECOVER
        // USDC button on the chip instead — one deliberate click.
        if (booking.payment_method === 'solana' && booking.escrow_pda) {
          showNotif('Denied — click RECOVER USDC to reclaim your funds', 'denied');
        } else {
          showNotif('Your request was denied — refund on the way', 'denied');
        }
        const id = String(booking.id);
        setRecentlyDenied(prev => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        setTimeout(() => {
          setRecentlyDenied(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 60_000);
      }
      if (old.status === 'pending' && booking.status === 'active')          showNotif('Your beam is live! 🎉', 'success');
      if (old.status === 'pending' && booking.status === 'approved_queued') showNotif("Approved — you're in the queue!", 'queue');
      // Admin kicked an active beam. Two possibilities for Solana:
      //   - settle_beam landed on-chain → the webhook clears escrow_pda, the
      //     viewer's refund has already hit their wallet. No action needed.
      //   - settle_beam failed (cranker hiccup, no wallet fallback) → DB
      //     flipped to expired but the PDA still holds funds. Surface an
      //     actionable nudge so the viewer can close it out themselves.
      if (old.status === 'active' && booking.status === 'expired') {
        if (booking.payment_method === 'solana' && booking.escrow_pda) {
          showNotif('Beam ended early — click RECOVER USDC to reclaim your refund', 'warning');
        }
      }
    });
    prevMyBookingsRef.current = myBookings;
  }, [myBookings]);

  // 2. Stripe Payment Return Handler
  useEffect(() => {
    if (!profile) return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const bookingId = params.get('booking_id');

    if (payment === 'success' && bookingId) {
      showNotif('Payment successful — request sent! 🎉', 'success');
      // Clean up the URL so the viewer doesn't see Stripe parameters
      const clean = `${window.location.pathname}?s=${profile.username}`;
      window.history.replaceState({}, '', clean);
    }

    if (payment === 'cancelled' && bookingId) {
      // Mark as denied via /api/stripe/cancel (authorized with the per-booking
      // cancel_token stashed by /api/stripe/authorize). Previously this wrote
      // status='denied' directly under bookings_update_anon, which anyone
      // could call on any booking id to mass-deny.
      const cancelToken = readBookingTokens()[bookingId];
      fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, cancel_token: cancelToken }),
      }).then(() => {
        forgetBookingToken(bookingId);
        if (typeof loadData === 'function') {
          loadData(profile.id, savedViewerName ?? undefined);
        }
      });
      showNotif('Payment cancelled', 'warning');
      const clean = `${window.location.pathname}?s=${profile.username}`;
      window.history.replaceState({}, '', clean);
    }
  }, [profile]);

  const getActiveBookingForSlot = (id: string) => activeBookings.find((b:any) => b.element_id===id)||null;
  const getMyBookingForSlot     = (id: string) => myBookings.find((b:any) => b.element_id===id && b.status!=='denied')||null;

  const canExtend = (elementId: string) => {
    const queueBehind = approvedQueuedBookings.filter((b:any) => b.element_id===elementId);
    return queueBehind.length === 0 && (queueCounts[elementId]||0) === 0;
  };

  const cancelBooking = async (bookingId: string) => {
  setCancelling(bookingId);
  // Viewer is anonymous, so we prove ownership with the per-booking
  // cancel_token handed to us by /api/stripe/authorize or /bookings/create-free
  // and stashed in localStorage. See stripe/cancel/route.ts.
  const cancelToken = readBookingTokens()[bookingId];
  const res = await fetch('/api/stripe/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking_id: bookingId, cancel_token: cancelToken }),
  });
  setCancelling(null);
  if (res.ok) {
    forgetBookingToken(bookingId);
    showNotif('Booking cancelled', 'warning');
  } else {
    showNotif('Cancel failed — the streamer can still deny this request', 'error');
  }
  if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
};

  // Expires a booking from the viewer side (runs when countdown hits 0 or viewer
  // ends early). Delegated to /api/bookings/expire-and-advance so the write
  // runs under service_role and the server can independently verify the
  // timer actually ran out — previously the overlay wrote status directly
  // under bookings_update_anon, which was a mass-expire attack surface.
  const clientExpireBooking = useCallback(async (booking: any) => {
    const res = await fetch('/api/bookings/expire-and-advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: booking.id }),
    });
    if (!res.ok && res.status !== 409) {
      // 409 = not-overdue (another client raced us or clock skew); silently
      // let realtime/cron catch it. Other errors are logged for diagnosis.
      console.error('[overlay] expire-and-advance failed:', res.status);
    }
    if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
  }, [profile?.id, loadData, savedViewerName]);

  // Detect video vs image from a URL's path extension (no server round-trip).
  const getUrlFileType = (url: string): 'image'|'video' => {
    const path = url.toLowerCase().split('?')[0];
    return /\.(mp4|webm|mov|ogv)$/.test(path) ? 'video' : 'image';
  };

  // Upload a viewer's file to the beams Storage bucket before payment.
  // Per-file-type caps: images are usually fine at 5 MB (a compressed
  // 1080p JPEG is ~1 MB, a PNG ~3 MB), but videos need real headroom —
  // a 10-second 1080p mp4 easily runs 8-15 MB. Accepting up to 20 MB
  // lets streamers show clips that don't look like motion-blurred mush.
  const MAX_IMAGE_BYTES = 5  * 1024 * 1024;
  const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
  const handleFileSelect = async (file: File) => {
    const fileType: 'image'|'video' = file.type.startsWith('video/') ? 'video' : 'image';
    const cap = fileType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > cap) {
      const mb = cap / (1024 * 1024);
      showNotif(`File too large — max ${mb} MB for ${fileType}s`, 'denied');
      return;
    }
    // P0 guard: free slots are image-only until video moderation ships.
    if (fileType === 'video' && selectedSlot && Number(selectedSlot.price_value) === 0) {
      showNotif('Videos are paid-slots only for now — please upload an image', 'denied');
      return;
    }
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const path = `${profile?.username ?? 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
    setUploading(true);
    const { error: upErr } = await supabase.storage.from('beams').upload(path, file, { contentType: file.type });
    if (upErr) { showNotif('Upload failed — try again', 'denied'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('beams').getPublicUrl(path);
    setUploadedUrl(publicUrl);
    setUploadedPath(path);
    setUploadedFileType(fileType);
    setUploading(false);
  };

  const openSlot = (el: any, joinQueue: boolean, extend=false) => {
    setSelectedSlot(el); setIsQueue(joinQueue); setIsExtend(extend);
    setImageUrl(''); setImageValid(false); setMessage('');
    setUploadedUrl(null); setUploadedPath(null); setUploadedFileType(null); setUploading(false);
    const maxDur = el.max_duration_minutes;
    const defaultSec = maxDur ? Math.min(60, maxDur * 60) : 60;
    setDurationSeconds(defaultSec);
    if (extend) {
      const myBooking = getMyBookingForSlot(el.id);
      if (myBooking?.image_url) { setImageUrl(myBooking.image_url); setImageValid(true); }
    }
  };
  const closeSlot = () => {
    setSelectedSlot(null); setIsExtend(false);
    setUploadedUrl(null); setUploadedPath(null); setUploadedFileType(null); setUploading(false);
  };
  const setDurationSecsClamped = (secs: number) => {
    const maxSecs = selectedSlot?.max_duration_minutes ? selectedSlot.max_duration_minutes * 60 : Infinity;
    setDurationSeconds(Math.max(30, Math.min(secs, maxSecs)));
  };

  const submitBooking = async () => {
  const hasMedia = uploadMode === 'upload' ? !!uploadedUrl : !!imageUrl;
  // Banner slots swap the content requirement: the viewer's message is the
  // primary content (renders as a scrolling marquee on stream), media is
  // optional. Non-banner slots keep the original media-required contract.
  const isBanner = selectedSlot?.shape === 'banner';
  const hasBannerMessage = isBanner && message.trim().length > 0 && message.length <= BANNER_MAX_MESSAGE;
  const hasRequiredContent = isBanner ? hasBannerMessage : hasMedia;
  if (!savedViewerName || !hasRequiredContent || !selectedSlot) {
    if (isBanner && !hasBannerMessage) {
      showNotif(`Type a message (up to ${BANNER_MAX_MESSAGE} chars) — it'll scroll across the banner.`, 'denied');
    }
    return;
  }
  setSubmitting(true);

  const currentQueue = queueCounts[selectedSlot.id] || 0;
  const effectiveImageUrl   = uploadMode === 'upload' ? uploadedUrl  : imageUrl;
  const effectiveStoragePath = uploadMode === 'upload' ? uploadedPath : null;
  const effectiveFileType   = uploadMode === 'upload' ? uploadedFileType : (imageUrl ? getUrlFileType(imageUrl) : null);

  const isFreeSlot = Number(selectedSlot.price_value) === 0;

  // ── FREE SLOT PATH ─────────────────────────────────────────────────────────
  // Free bookings go through a server-gated endpoint that enforces captcha +
  // text moderation. Direct anon inserts for price_value=0 slots are blocked
  // at the RLS layer (see 20260419000000_p0_hardening.sql).
  if (isFreeSlot) {
    // P0 guard: free slots are image-only until video moderation ships.
    if (effectiveFileType === 'video') {
      showNotif('Videos are paid-slots only for now — please use an image', 'denied');
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch('/api/bookings/create-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id:       profile.id,
          element_id:       selectedSlot.id,
          viewer_name:      savedViewerName,
          message:          isExtend ? `⏱ Extension request${message.trim() ? ' — ' + message.trim() : ''}` : (message.trim() || null),
          image_url:        effectiveImageUrl,
          storage_path:     effectiveStoragePath,
          file_type:        effectiveFileType,
          duration_minutes: durationSeconds / 60,
          is_queued:        isQueue || isExtend,
          queue_position:   (isQueue || isExtend) ? currentQueue + 1 : null,
          turnstile_token:  turnstileToken,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        showNotif(json.error || 'Failed to submit free booking', 'error');
        setSubmitting(false);
        return;
      }
      if (json.booking_id && json.cancel_token) {
        rememberBookingToken(json.booking_id, json.cancel_token);
      }
      showNotif('★ Free request sent — awaiting streamer approval', 'success');
      setSubmitting(false);
      closeSlot();
    } catch (err) {
      console.error('Free booking failed:', err);
      showNotif('Server error. Please try again.', 'error');
      setSubmitting(false);
    }
    return;
  }

  // ── PAID SLOT PATH ─────────────────────────────────────────────────────────
  // Server-gated: stale-cleanup + duplicate-check + insert all run as
  // service_role so anon no longer needs UPDATE or INSERT on bookings for
  // Stripe rows. authorize() still mints the cancel_token right before the
  // Checkout redirect.
  let newBookingId: string;
  try {
    const createRes = await fetch('/api/bookings/create-stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id:       profile.id,
        element_id:       selectedSlot.id,
        viewer_name:      savedViewerName,
        image_url:        effectiveImageUrl,
        storage_path:     effectiveStoragePath,
        file_type:        effectiveFileType,
        message: isExtend ? `⏱ Extension request${message.trim() ? ' — ' + message.trim() : ''}` : (message.trim() || null),
        duration_minutes: durationSeconds / 60,
        price_value:      selectedSlot.price_value,
        price_unit:       selectedSlot.price_unit,
        is_queued:        isQueue || isExtend,
        queue_position:   (isQueue || isExtend) ? currentQueue + 1 : null,
        is_extend:        isExtend,
      }),
    });
    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !createJson.booking_id) {
      if (createJson.error === 'already_booked') {
        setSubmitting(false);
        showNotif('You already have a booking for this slot', 'warning');
        closeSlot();
        return;
      }
      console.error('create-stripe error:', createJson.error);
      showNotif(createJson.error || 'Failed to create booking', 'error');
      setSubmitting(false);
      return;
    }
    newBookingId = createJson.booking_id as string;
  } catch (err) {
    console.error('create-stripe fetch failed:', err);
    showNotif('Server error. Please try again.', 'error');
    setSubmitting(false);
    return;
  }

  try {
    const res = await fetch('/api/stripe/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: newBookingId }),
    });
    const json = await res.json();
    if (json.checkout_url) {
      // Store the cancel_token BEFORE navigating away — we won't get another
      // chance once Stripe Checkout takes over the page.
      if (json.cancel_token) rememberBookingToken(newBookingId, json.cancel_token);
      window.location.href = json.checkout_url;
    } else {
      console.error('Stripe error:', json.error);
      showNotif(json.error || 'Payment failed to initialize', 'error');
      setSubmitting(false);
    }
  } catch (err) {
    console.error('Authorize fetch failed:', err);
    showNotif('Server error. Please try again.', 'error');
    setSubmitting(false);
  }
};

  // ── Solana / CASI escrow booking ────────────────────────────────────────────
  const submitSolanaBooking = async () => {
    const effectiveSolImageUrl    = uploadMode === 'upload' ? uploadedUrl    : imageUrl;
    const effectiveSolStoragePath = uploadMode === 'upload' ? uploadedPath   : null;
    const effectiveSolFileType    = uploadMode === 'upload' ? uploadedFileType : (imageUrl ? getUrlFileType(imageUrl) : null);
    if (!savedViewerName || !effectiveSolImageUrl || !selectedSlot || !publicKey || !wallet?.adapter) return;
    if (Number(selectedSlot.price_value) === 0) {
      // Free slots go through submitBooking, not the Solana rail.
      showNotif('This slot is free — use “Send Free Request” instead', 'warning');
      return;
    }
    if (!profile?.solana_wallet) {
      showNotif('This streamer has not linked a Solana wallet yet', 'denied');
      return;
    }
    setSubmitting(true);
    setTxStatus('booking');
    setTxError(null);

    // Stale-pending cleanup + insert + cancel_token issuance happen
    // server-side. The route stale-cleans the same (profile_id, element_id,
    // viewer_name, payment_method='solana', no-escrow) set the overlay used
    // to deny directly under bookings_update_anon, then issues a per-booking
    // cancel_token used by the rest of this flow to authorize follow-up
    // writes via /api/bookings/viewer-deny + /api/bookings/attach-solana-tx.

    // Duplicate check (informational — server doesn't enforce this).
    if (!isExtend) {
      const { data: existing } = await supabase.from('bookings').select('id')
        .eq('profile_id', profile.id).eq('element_id', selectedSlot.id)
        .eq('viewer_name', savedViewerName).in('status', ['pending','active','approved_queued'])
        .not('escrow_pda', 'is', null)
        .single();
      if (existing) {
        setSubmitting(false);
        showNotif('You already have a booking for this slot', 'warning');
        closeSlot();
        return;
      }
    }

    const currentQueue = queueCounts[selectedSlot.id] || 0;
    const createRes = await fetch('/api/bookings/create-solana', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id:    profile.id,
        element_id:    selectedSlot.id,
        viewer_name:   savedViewerName,
        image_url:     effectiveSolImageUrl,
        storage_path:  effectiveSolStoragePath,
        file_type:     effectiveSolFileType,
        message: isExtend ? `⏱ Extension request${message.trim() ? ' — ' + message.trim() : ''}` : (message.trim() || null),
        duration_minutes: durationSeconds / 60,
        price_value:   selectedSlot.price_value,
        price_unit:    selectedSlot.price_unit,
        is_queued:     isQueue || isExtend,
        queue_position: (isQueue || isExtend) ? currentQueue + 1 : null,
      }),
    });
    const createBody = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !createBody?.booking_id) {
      const reason = typeof createBody?.error === 'string' ? createBody.error : 'Failed to create booking';
      showNotif(reason, 'error');
      setTxStatus('error'); setTxError(reason);
      setSubmitting(false);
      return;
    }
    const newBooking = { id: createBody.booking_id as string };
    rememberBookingToken(newBooking.id, createBody.cancel_token as string);

    setTxStatus('streaming');

    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');

      const usdcDecimals    = 6;
      const durationMinutes = durationSeconds / 60;
      const totalUsdc       = selectedSlot.price_unit === 'min'
        ? selectedSlot.price_value * durationMinutes
        : selectedSlot.price_value * (durationMinutes / 60);

      // ── Pre-flight: verify viewer has SOL + a USDC ATA with enough balance ──
      const connection = new Connection(SOLANA_RPC);

      // SOL: initialize_escrow creates both the EscrowState PDA and a PDA-owned
      // vault ATA (~2× rent) plus a signature fee. Empirically ~0.003 SOL on
      // devnet — we require 0.01 for safety margin.
      const solLamports = await connection.getBalance(publicKey);
      const MIN_SOL     = 0.01 * 1e9;
      if (solLamports < MIN_SOL) {
        showNotif(
          IS_MAINNET
            ? `Need SOL for rent + fees. You have ${(solLamports / 1e9).toFixed(4)} SOL — top up your wallet and try again.`
            : `Need devnet SOL for rent + fees. You have ${(solLamports / 1e9).toFixed(4)} SOL. Airdrop at faucet.quicknode.com/solana/devnet`,
          'denied',
        );
        await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
        setSubmitting(false);
        return;
      }

      // USDC ATA balance check.
      const { value: tokenAccounts } = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { mint: new PublicKey(USDC_MINT) },
      );
      if (tokenAccounts.length === 0) {
        showNotif(
          IS_MAINNET
            ? 'No USDC found in your wallet. Buy or bridge USDC and try again.'
            : 'No devnet USDC found (mint 4zMMC9…DU). Switch Phantom to Devnet then mint at spl-token-faucet.vercel.app',
          'denied',
        );
        await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
        setSubmitting(false);
        return;
      }
      const usdcBalance: number =
        tokenAccounts[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;
      if (usdcBalance < totalUsdc) {
        showNotif(
          `Insufficient USDC: you have ${usdcBalance.toFixed(2)}, need ${totalUsdc.toFixed(2)}`,
          'denied',
        );
        await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
        setSubmitting(false);
        return;
      }
      console.log('[solana] pre-flight passed — SOL:', (solLamports / 1e9).toFixed(4), 'USDC:', usdcBalance);
      // ──────────────────────────────────────────────────────────────────────

      // Lock full amount in the CASI escrow PDA. Settlement pays the
      // streamer 100% of the vested portion with no platform fee deducted.
      const { CasiEscrowClient } = await import('@/lib/casi-escrow');
      if (!signTransaction) throw new Error('Wallet missing signTransaction');
      const anchorWallet = {
        publicKey,
        signTransaction,
        signAllTransactions:
          signAllTransactions ||
          (async <T,>(txs: T[]) => {
            const out: T[] = [];
            for (const tx of txs) out.push((await signTransaction(tx as never)) as T);
            return out;
          }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      const client = new CasiEscrowClient(connection, anchorWallet, WALLET_ADAPTER_CLUSTER);

      const amountUsdcMicro = Math.round(totalUsdc * 10 ** usdcDecimals);
      const durationSecsInt = Math.round(durationSeconds);

      const { sig, escrowPda } = await client.initializeBeam({
        escrowId:     newBooking.id,
        streamer:     new PublicKey(profile.solana_wallet),
        amountUsdc:   amountUsdcMicro,
        durationSecs: durationSecsInt,
      });

      // Persist on-chain state so the admin settle/cancel flows can rebuild
      // the CPI accounts without re-fetching from chain. cancel_token-authed
      // server route — anon UPDATE on tx_signature/escrow_pda/viewer_wallet
      // is being phased out (see migration 20260421...).
      const attachRes = await fetch('/api/bookings/attach-solana-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id:    newBooking.id,
          cancel_token:  readBookingTokens()[newBooking.id],
          tx_signature:  sig,
          escrow_pda:    escrowPda,
          viewer_wallet: publicKey.toBase58(),
        }),
      });
      if (!attachRes.ok) {
        // Funds are already locked on-chain. Don't fall through to the catch
        // (which would deny) — leave the row where it is and surface the PDA
        // so recovery is possible even if the viewer closes this tab.
        console.error('[solana beam] attach failed after on-chain success:', attachRes.status, 'sig=', sig, 'pda=', escrowPda);
        setTxStatus('error');
        setTxError(`Payment confirmed on-chain (tx ${sig}) but booking update failed. Contact the streamer with escrow ${escrowPda}.`);
        showNotif('Payment confirmed but booking update failed — see console for recovery info', 'error');
        setSubmitting(false);
        return;
      }

      setConfirmedTxId(sig);
      refreshWalletNav();
      setTxStatus('waiting');
      showNotif('◎ Payment locked — awaiting streamer approval!', 'success');
      setShowConfirmModal(false);
      closeSlot();
      if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
    } catch (err: unknown) {
      const { formatEscrowError, isUserRejection } = await import('@/lib/casi-errors');
      console.error('[solana beam] initializeBeam failed:', err);

      // User rejected in wallet — nothing on-chain, safe to deny.
      if (isUserRejection(err)) {
        await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
        setTxStatus('error'); setTxError('Transaction rejected in wallet');
        showNotif('Transaction rejected in wallet', 'denied');
        setSubmitting(false);
        return;
      }

      // Any other error can still land the tx on-chain — confirmation
      // timeouts, Anchor's rebroadcast quirk ("already been processed"), RPC
      // flakes. Probe the PDA before denying: if funds are locked, backfill
      // the booking so the streamer can approve or the viewer can recover.
      //
      // Retry the probe with backoff because the RPC replica we hit may not
      // have propagated the freshly-landed account yet. Without this, a tx
      // that actually succeeded gets treated as "nothing on-chain", the
      // booking denied, and the viewer's USDC stuck in a vault with no DB
      // pointer back to it (no recover-USDC button surfaces).
      try {
        const { Connection } = await import('@solana/web3.js');
        const { deriveEscrowPda } = await import('@/lib/casi-escrow');
        const [escrowPda] = deriveEscrowPda(newBooking.id);
        const conn = new Connection(SOLANA_RPC, 'confirmed');
        const probeDelaysMs = [0, 800, 1600, 2400];
        let info = null;
        for (const delay of probeDelaysMs) {
          if (delay) await new Promise(r => setTimeout(r, delay));
          info = await conn.getAccountInfo(escrowPda).catch(() => null);
          if (info) break;
        }
        if (info) {
          const recoverRes = await fetch('/api/bookings/attach-solana-tx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_id:    newBooking.id,
              cancel_token:  readBookingTokens()[newBooking.id],
              escrow_pda:    escrowPda.toBase58(),
              viewer_wallet: publicKey.toBase58(),
            }),
          });
          if (recoverRes.ok) {
            refreshWalletNav();
            setTxStatus('waiting');
            showNotif('◎ Payment locked — awaiting streamer approval!', 'success');
            setShowConfirmModal(false);
            closeSlot();
            if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
            setSubmitting(false);
            return;
          }
          console.error('[solana beam] recovery attach failed:', recoverRes.status, 'pda=', escrowPda.toBase58());
          setTxStatus('error');
          setTxError(`Payment confirmed on-chain but booking update failed. Contact the streamer with escrow ${escrowPda.toBase58()}.`);
          showNotif('Payment confirmed but booking update failed — see console for recovery info', 'error');
          setSubmitting(false);
          return;
        }
      } catch (probeErr) {
        console.error('[solana beam] PDA probe failed:', probeErr);
      }

      // Nothing on-chain — safe to deny.
      const userMsg = formatEscrowError(err);
      await fetch('/api/bookings/viewer-deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: newBooking.id, cancel_token: readBookingTokens()[newBooking.id] }) });
      setTxStatus('error'); setTxError(userMsg);
      showNotif(userMsg, 'denied');
    }

    setSubmitting(false);
  };

  /**
   * Build the CasiEscrowClient once — used by both the live-beam "end early"
   * (settle_beam) and the denied-beam "recover USDC" (cancel_escrow) flows.
   * Returns null if the wallet isn't ready to sign.
   */
  const buildViewerCasiClient = async () => {
    if (!publicKey || !signTransaction) return null;
    const { Connection } = await import('@solana/web3.js');
    const { CasiEscrowClient } = await import('@/lib/casi-escrow');
    const anchorWallet = {
      publicKey,
      signTransaction,
      signAllTransactions:
        signAllTransactions ||
        (async <T,>(txs: T[]) => {
          const out: T[] = [];
          for (const tx of txs) out.push((await signTransaction(tx as never)) as T);
          return out;
        }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    return new CasiEscrowClient(new Connection(SOLANA_RPC), anchorWallet, WALLET_ADAPTER_CLUSTER);
  };

  /**
   * Settle a live Solana beam via `settle_beam`. On-chain integer proration
   * pays the streamer the vested portion and refunds the viewer the rest.
   * Called when the viewer clicks "end early" on an active beam.
   */
  const settleSolanaBeam = async (booking: any) => {
    if (!booking.escrow_pda || !booking.viewer_wallet || !profile?.solana_wallet) return;
    try {
      const client = await buildViewerCasiClient();
      if (!client) throw new Error('Wallet not ready to sign');
      const { PublicKey: PK } = await import('@solana/web3.js');
      await client.settleBeam({
        escrowId: booking.id,
        viewer:   new PK(booking.viewer_wallet),
        streamer: new PK(profile.solana_wallet),
      });
    } catch (err) {
      // "Transaction has already been processed" = Anchor's .rpc() resubmitted
      // the signed tx after the first submission already landed. The refund
      // went through; treat as success and fall through to the happy path.
      const { formatEscrowError, isAlreadyProcessed } = await import('@/lib/casi-errors');
      if (!isAlreadyProcessed(err)) {
        console.error('[beam] settleBeam failed:', err);
        showNotif(formatEscrowError(err), 'denied');
        return;
      }
    }
    refreshWalletNav();
    showNotif('◎ Beam ended — refund returned to your wallet', 'warning');
    if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
  };

  /**
   * Reclaim USDC from a stuck Solana escrow. Decodes the on-chain status byte
   * and picks the right instruction:
   *   - Pending → `cancel_escrow` → 100% refund. Happens when the streamer
   *     denied a booking that was never started.
   *   - Active → `settle_beam` → pro-rata refund (vested to streamer, rest
   *     to viewer). Happens when the streamer kicked but the cranker-signed
   *     `settle_beam_delegated` didn't land (no cranker / no delegate / chain
   *     hiccup). Either party can settle at any time while Active, and anyone
   *     can settle after the duration elapses.
   *
   * On-chain state is authoritative. DB status may say `denied` or `expired`
   * but the PDA tells us what's actually possible to do with the funds.
   */
  const reclaimSolanaEscrow = async (booking: any) => {
    if (!booking.escrow_pda) return;
    const clearPdaInDb = async (): Promise<boolean> => {
      try {
        const denyRes = await fetch('/api/bookings/viewer-deny', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booking_id: booking.id,
            cancel_token: readBookingTokens()[booking.id],
            null_escrow: true,
          }),
        });
        if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
        return denyRes.ok;
      } catch (err) {
        console.error('[reclaim] clearPdaInDb failed:', err);
        return false;
      }
    };

    const { Connection, PublicKey } = await import('@solana/web3.js');
    const conn = new Connection(SOLANA_RPC);
    // Poll-probe the PDA to tolerate RPC replica lag: a tx that just closed
    // the account can take a beat to propagate to every replica we hit, and
    // a single getAccountInfo can read the stale side and falsely report
    // "still alive". Treat "gone on any attempt" as authoritative closure.
    const isPdaClosed = async (attempts = 6, delayMs = 1000): Promise<boolean> => {
      for (let i = 0; i < attempts; i++) {
        const info = await conn.getAccountInfo(new PublicKey(booking.escrow_pda)).catch(() => null);
        if (!info) return true;
        if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
      }
      return false;
    };

    const pdaInfo = await conn.getAccountInfo(new PublicKey(booking.escrow_pda)).catch(() => null);
    if (!pdaInfo) {
      // PDA already closed — funds have left the vault. Clean up the stale row.
      const ok = await clearPdaInDb();
      showNotif(ok ? 'Escrow already closed — cleared' : 'Escrow closed, but DB cleanup failed — refresh the page', 'warning');
      return;
    }

    // EscrowState status byte sits at offset 161 (8 discriminator + 32+32+32+32
    // pubkeys + 8+8+8 u64/i64 + 1 escrow_type). 0 = Pending, 1 = Active.
    // Settled/Cancelled close the account, so a non-null read implies {0, 1}.
    const STATUS_OFFSET = 161;
    const statusByte = pdaInfo.data.length > STATUS_OFFSET ? pdaInfo.data[STATUS_OFFSET] : -1;
    const isActive = statusByte === 1;

    if (isActive) {
      // settle_beam: program splits total pro-rata by elapsed/duration.
      // Viewer's unvested portion lands in their USDC ATA in the same tx.
      if (!booking.viewer_wallet || !profile?.solana_wallet) {
        showNotif('Missing wallet info — refresh and try again', 'denied');
        return;
      }
      try {
        const client = await buildViewerCasiClient();
        if (!client) throw new Error('Wallet not ready to sign');
        const { PublicKey: PK } = await import('@solana/web3.js');
        await client.settleBeam({
          escrowId: booking.id,
          viewer:   new PK(booking.viewer_wallet),
          streamer: new PK(profile.solana_wallet),
        });
      } catch (err) {
        const { formatEscrowError, isAlreadyProcessed } = await import('@/lib/casi-errors');
        const msg = err instanceof Error ? err.message : String(err);
        // AlreadySettled / AccountNotInitialized = the escrow closed between
        // our probe and our tx (streamer retried, cranker caught up). Verify
        // on-chain and treat as success if so.
        if (isAlreadyProcessed(err) || /AlreadySettled|AccountNotInitialized/i.test(msg)) {
          if (await isPdaClosed()) {
            const ok = await clearPdaInDb();
            refreshWalletNav();
            showNotif(ok ? '◎ Refund returned to your wallet' : 'Refund returned — booking row needs a manual refresh', 'warning');
            return;
          }
        }
        console.error('[reclaim] settleBeam failed:', err);
        showNotif(formatEscrowError(err), 'denied');
        return;
      }
      const closed = await isPdaClosed();
      const denyOk = await clearPdaInDb();
      refreshWalletNav();
      showNotif(
        denyOk
          ? (closed ? '◎ Prorated refund returned to your wallet' : '◎ Settle confirmed — refund landing in your wallet')
          : '◎ Refund returned — this device will sync shortly',
        'warning',
      );
      return;
    }

    // Status == Pending — original cancel_escrow path.
    let cancelThrew = false;
    try {
      const client = await buildViewerCasiClient();
      if (!client) throw new Error('Wallet not ready to sign');
      await client.cancelEscrow({ escrowId: booking.id });
    } catch (err) {
      cancelThrew = true;
      const { formatEscrowError } = await import('@/lib/casi-errors');
      console.error('[beam] cancelEscrow failed:', err);
      // AlreadySettled = escrow moved out of Pending between our probe and the
      // cancel (approved / settled / cancelled elsewhere). already-processed =
      // Anchor's .rpc() resubmitted a tx that already landed; the underlying
      // cancel likely succeeded. AccountNotInitialized = Anchor couldn't find
      // a valid EscrowState (closed). In all three cases the tx may have
      // actually closed the PDA — poll-probe before concluding otherwise.
      const msg = err instanceof Error ? err.message : String(err);
      if (/AlreadySettled|already.*processed|AccountNotInitialized/i.test(msg)) {
        if (await isPdaClosed()) {
          const ok = await clearPdaInDb();
          refreshWalletNav();
          showNotif(ok ? '◎ USDC returned to your wallet' : 'USDC returned, but booking row needs a manual refresh', 'warning');
          return;
        }
        showNotif('Beam is live — wait for it to finish', 'denied');
        return;
      }
      showNotif(formatEscrowError(err), 'denied');
      return;
    }

    // .rpc() resolved — Anchor has awaited confirmed commitment, so the tx
    // reached the leader and is fully on-chain. Any lingering "PDA still
    // alive" read from here is RPC replica lag, not a failed cancel. Always
    // try to clean the DB row (the Helius webhook would eventually do the
    // same; we short-circuit for snappier UX on the device that signed).
    // clearPdaInDb can fail with 403 when the viewer recovered from a
    // different browser than they booked on (cancel_token lives in
    // localStorage) — that's fine, the webhook will catch it.
    if (cancelThrew) return; // belt-and-suspenders; handled above
    const closed = await isPdaClosed();
    const denyOk = await clearPdaInDb();
    refreshWalletNav();
    if (!closed) {
      console.warn('[beam] cancelEscrow confirmed but PDA probe still reads alive (replica lag):', booking.escrow_pda);
    }
    showNotif(
      denyOk
        ? (closed ? '◎ USDC returned to your wallet' : '◎ Cancel confirmed — USDC landing in your wallet')
        : '◎ USDC returned — this device will sync shortly',
      'warning',
    );
  };

  // Bulk-clear ghost RECOVER USDC chips — closed PDAs whose DB rows still
  // carry escrow_pda from a previous build / aborted flow. The server probes
  // each row's PDA and nulls escrow_pda on the ones that are actually gone;
  // rows where the PDA is still alive require a real cancel/settle sign and
  // are left alone.
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const runStaleSolanaCleanup = async () => {
    const wallet = viewerWalletRef.current;
    if (!wallet || cleanupBusy) return;
    setCleanupBusy(true);
    try {
      const res = await fetch('/api/bookings/cleanup-stale-solana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewer_wallet: wallet, profile_id: profile?.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotif('Cleanup failed — try again', 'denied');
        return;
      }
      const cleaned = Number(body?.cleaned ?? 0);
      const stillOpen = Number(body?.stillOpen ?? 0);
      if (cleaned > 0 && profile?.id) {
        await loadData(profile.id, savedViewerName ?? undefined);
      }
      if (cleaned === 0 && stillOpen === 0) {
        showNotif('Nothing to clean — all chips are real', 'warning');
      } else if (cleaned > 0 && stillOpen === 0) {
        showNotif(`Cleared ${cleaned} ghost chip${cleaned === 1 ? '' : 's'}`, 'success');
      } else if (cleaned > 0 && stillOpen > 0) {
        showNotif(`Cleared ${cleaned}; ${stillOpen} still need manual recover`, 'warning');
      } else {
        showNotif(`${stillOpen} chip${stillOpen === 1 ? '' : 's'} still hold funds — click RECOVER USDC`, 'warning');
      }
    } catch (err) {
      console.error('[cleanup] failed:', err);
      showNotif('Cleanup failed — try again', 'denied');
    } finally {
      setCleanupBusy(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  const estimatedCost = selectedSlot
    ? selectedSlot.price_unit==='min'
      ? (selectedSlot.price_value * (durationSeconds / 60)).toFixed(2)
      : (selectedSlot.price_value * (durationSeconds / 3600)).toFixed(2)
    : '0';

  // True when the viewer has a valid image/video ready to submit.
  const canSubmit = uploadMode === 'upload'
    ? !!uploadedUrl
    : (!!imageUrl && imageUrl.startsWith('https://') && imageValid);

  // For booking form accent: extend=yellow, queue/rent=skin accent
  const accentColor    = isExtend ? '#eab308' : tc;
  const accentColorRgb = isExtend ? '234, 179, 8' : tcRgb;
  // Keep denied Solana bookings visible if their escrow PDA still holds funds
  // — the viewer may need to click "recover USDC" to reclaim from chain.
  // Keep expired Solana bookings visible on the same condition — a kick whose
  // on-chain settle silently failed leaves the PDA alive and only the viewer
  // can close it via settle_beam. Keep denied Stripe bookings visible for
  // ~60s so the viewer sees a "refund on the way" chip (Stripe cancel voids
  // the PI automatically, no action needed).
  const visibleMyBookings = myBookings.filter((b:any) => {
    if (b.status === 'expired') {
      return b.payment_method === 'solana' && b.escrow_pda;
    }
    if (b.status === 'denied') {
      return (b.payment_method === 'solana' && b.escrow_pda)
        || (b.payment_method === 'stripe' && recentlyDenied.has(String(b.id)));
    }
    return true;
  });

  if (loading) return null;
  if (!isOBS && !nameConfirmed) return (
    <>
      <SkinProvider skin={profile?.skin} themeColor={profile?.theme_color} />
      <NameEntryScreen onConfirm={confirmName} tc={tc} />
    </>
  );

  return (
    <>
      <SkinProvider skin={profile?.skin} themeColor={profile?.theme_color} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes fadeIn    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes springPop { from{opacity:0;transform:scale(0.88) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        /* Fires once when a beam goes live: 3s bloom in the streamer's accent
           colour, keyed on activeBooking.id so only the transition triggers it
           (a fresh page mount with an already-active beam will also glow — OK
           for v1; OBS rarely reloads). */
        @keyframes beamGlow  { 0%{box-shadow:0 0 0 rgba(var(--casi-accent-rgb),0)} 15%{box-shadow:0 0 42px 8px rgba(var(--casi-accent-rgb),0.85)} 100%{box-shadow:0 0 0 rgba(var(--casi-accent-rgb),0)} }
        /* Banner marquee: scrolls the viewer's message right-to-left over 20s.
           Infinite loop within the beam's duration. Container clips, track is
           inline-block so its width depends on content length. */
        @keyframes beamMarquee { from{transform:translateX(100%)} to{transform:translateX(-100%)} }
        .beam-shape-rounded { border-radius: 14px; overflow: hidden; }
        .beam-shape-circle  { clip-path: circle(50%); }
        .beam-shape-hex     { clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); }
        .beam-glow          { animation: beamGlow 3s ease-out 1; will-change: box-shadow; }
        .beam-banner        { display:flex; align-items:center; width:100%; height:100%; overflow:hidden; background:rgba(0,0,0,0.78); border-top:2px solid rgba(var(--casi-accent-rgb),0.4); border-bottom:2px solid rgba(var(--casi-accent-rgb),0.4); white-space:nowrap; }
        .beam-banner-track  { display:inline-block; padding-left:100%; color:var(--casi-accent); font-family:'Syne',sans-serif; font-weight:800; font-size:28px; letter-spacing:1px; animation: beamMarquee 20s linear infinite; }
        .ov { min-height:100vh; background:${isOBS?'transparent':'var(--casi-bg)'}; color:var(--casi-text); font-family:'Syne',sans-serif; }

        .ov-nav { display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:56px; border-bottom:1px solid var(--casi-surface); background:color-mix(in srgb,var(--casi-bg) 94%,transparent); backdrop-filter:blur(20px); position:sticky; top:0; z-index:200; }
        .ov-logo { display:flex; align-items:center; gap:8px; text-decoration:none; }
        .ov-wm { font-size:18px; font-weight:800; color:var(--casi-accent); letter-spacing:-0.5px; }
        .ov-nav-right { display:flex; align-items:center; gap:10px; }
        .notif { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1px; padding:5px 12px; border-radius:20px; animation:springPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both; white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis; }
        .viewer-chip { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.04); border:1px solid var(--casi-border); border-radius:20px; padding:5px 12px; cursor:pointer; transition:border-color .2s; }
        .viewer-chip:hover { border-color:#333; }
        .vdot { width:6px; height:6px; border-radius:50%; background:var(--casi-accent); animation:blink 1.5s infinite; flex-shrink:0; }
        .vname { font-family:'DM Mono',monospace; font-size:10px; color:#888; }
        .name-edit-input { background:rgba(255,255,255,0.05); border:1px solid rgba(var(--casi-accent-rgb),0.31); border-radius:8px; padding:6px 12px; font-size:12px; color:var(--casi-text); outline:none; font-family:'DM Mono',monospace; width:130px; }

        .ov-main { max-width:1200px; margin:0 auto; padding:16px 20px 48px; }

        .my-beams { background:var(--casi-surface); border:1px solid var(--casi-border); border-radius:12px; padding:14px 16px; margin-bottom:14px; animation:fadeIn .3s ease; }
        .my-beams-lbl { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--casi-text-muted); margin-bottom:10px; }
        .my-beams-list { display:flex; flex-wrap:wrap; gap:8px; }
        .beam-chip { display:flex; align-items:center; gap:8px; border-radius:10px; padding:8px 12px; border:1px solid; font-size:12px; }
        .cancel-btn { background:none; border:none; font-family:'DM Mono',monospace; font-size:9px; color:rgba(248,113,113,0.5); cursor:pointer; text-transform:uppercase; letter-spacing:1px; transition:color .2s; padding:0; margin-left:4px; }
        .cancel-btn:hover { color:#f87171; }

        .stream-canvas { width:100%; aspect-ratio:16/9; border-radius:12px; border:1px solid var(--casi-border); background:var(--casi-bg); position:relative; overflow:hidden; margin-bottom:10px; }

        .slots-sec { margin-top:20px; }
        .slots-lbl { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--casi-text-muted); margin-bottom:10px; display:flex; align-items:center; gap:8px; }
        .slots-lbl::before { content:''; display:block; width:16px; height:1px; background:var(--casi-border); }
        .slots-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px; }
        .slot-card { background:var(--casi-surface); border:1px solid var(--casi-border); border-radius:12px; padding:14px; cursor:pointer; transition:all .2s; display:flex; align-items:center; gap:10px; }
        .slot-card:hover:not(.s-disabled) { border-color:rgba(var(--casi-accent-rgb),0.3); transform:translateY(-1px); }
        .slot-card.s-disabled { cursor:default; opacity:0.55; }
        .s-thumb { width:36px; height:36px; border-radius:7px; overflow:hidden; background:var(--casi-bg); border:1px solid var(--casi-border); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:15px; }
        .s-type  { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:var(--casi-text-muted); margin-bottom:3px; }
        .s-price { font-family:'DM Mono',monospace; font-size:13px; font-weight:500; }

        .bf { background:var(--casi-surface); border-radius:14px; padding:20px; margin-top:10px; animation:fadeIn .25s ease; }
        .bf-hdr { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }
        .bf-type  { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; margin-bottom:4px; }
        .bf-price { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
        .bf-x { background:none; border:none; color:var(--casi-text-muted); cursor:pointer; font-size:18px; padding:4px; transition:color .2s; }
        .bf-x:hover { color:var(--casi-text); }
        .bf-lbl { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--casi-text-muted); display:block; margin-bottom:8px; }
        .bf-inp { width:100%; background:var(--casi-bg); border:1px solid var(--casi-border); border-radius:10px; padding:12px 16px; font-size:14px; color:var(--casi-text); outline:none; font-family:'Syne',sans-serif; transition:border-color .2s; }
        .bf-inp::placeholder { color:#333; }
        .bf-hint { font-family:'DM Mono',monospace; font-size:10px; margin-top:6px; }
        .bf-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .dur-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .dur-btn { font-family:'DM Mono',monospace; font-size:10px; padding:7px 12px; border-radius:8px; border:1px solid var(--casi-border); background:none; color:var(--casi-text-muted); cursor:pointer; transition:all .2s; }
        .dur-btn:hover { border-color:rgba(var(--casi-accent-rgb),0.3); color:var(--casi-text); }
        .bf-footer { display:flex; align-items:center; justify-content:space-between; padding-top:14px; border-top:1px solid var(--casi-surface); margin-top:8px; gap:12px; }
        .bf-cost-lbl { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--casi-text-muted); }
        .bf-cost-val { font-size:22px; font-weight:800; letter-spacing:-0.5px; margin-top:2px; }
        .bf-sub { font-family:'Syne',sans-serif; font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:0.3px; padding:13px 24px; border-radius:10px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
        .bf-sub:disabled { background:var(--casi-border) !important; color:#444 !important; cursor:not-allowed; }
        .bf-sub:hover:not(:disabled) { filter:brightness(1.1); transform:translateY(-1px); }

        @media (max-width:640px) {
          .ov-nav { padding:0 16px; }
          .ov-main { padding:12px 14px 60px; }
          .bf-grid { grid-template-columns:1fr; }
          .bf-footer { flex-direction:column; align-items:stretch; }
          .bf-sub { width:100%; text-align:center; }
          .slots-grid { grid-template-columns:1fr 1fr; }
        }
        @media (max-width:360px) { .slots-grid { grid-template-columns:1fr; } }
      `}</style>

      <div className="ov">
        {!isOBS && (
          <nav className="ov-nav">
            <a href="/search" className="ov-logo">
              <Logo scale={0.26} color={tc} />
              <span className="ov-wm">casi</span>
            </a>
            <div className="ov-nav-right">
              {/* Wallet balance row — devnet dot, SOL, USDC, pubkey, dropdown */}
              <WalletNav />
              {notification && (
                <div className="notif" style={
                  notification.type==='success' ? { background:`rgba(${tcRgb},0.09)`, border:`1px solid rgba(${tcRgb},0.25)`, color:tc } :
                  notification.type==='queue'   ? { background:`rgba(${tcRgb},0.08)`, border:`1px solid rgba(${tcRgb},0.21)`, color:tc } :
                  notification.type==='denied'  ? { background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', color:'#f87171' } :
                  { background:'rgba(234,179,8,0.1)', border:'1px solid rgba(234,179,8,0.25)', color:'#facc15' }
                }>{notification.text}</div>
              )}
              {selectedSlot && <button onClick={closeSlot} style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#555', background:'none', border:'none', cursor:'pointer', textTransform:'uppercase', letterSpacing:1.5 }}>Cancel</button>}
              {savedViewerName && !selectedSlot && (
                showChangeName ? (
                  <input type="text" defaultValue={savedViewerName} autoFocus className="name-edit-input"
                    onKeyDown={(e) => { if(e.key==='Enter'){const v=(e.target as HTMLInputElement).value.trim(); if(v){confirmName(v);setShowChangeName(false);}} if(e.key==='Escape')setShowChangeName(false); }}
                    onBlur={(e) => { const v=e.target.value.trim(); if(v)confirmName(v); setShowChangeName(false); }} />
                ) : (
                  <div className="viewer-chip" onClick={() => setShowChangeName(true)}>
                    <span className="vdot" />
                    <span className="vname">@{savedViewerName}</span>
                  </div>
                )
              )}
            </div>
          </nav>
        )}

        <main className={isOBS ? '' : 'ov-main'}>

          {/* MY BEAMS */}
          {!isOBS && visibleMyBookings.length > 0 && !selectedSlot && (
            <div className="my-beams">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div className="my-beams-lbl" style={{ marginBottom:0 }}>Your beams</div>
                {viewerWalletRef.current && visibleMyBookings.some((b:any) => b.payment_method === 'solana' && b.escrow_pda && (b.status === 'denied' || b.status === 'expired')) && (
                  <button
                    onClick={runStaleSolanaCleanup}
                    disabled={cleanupBusy}
                    style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:1.5, textTransform:'uppercase', background:'none', border:'1px solid var(--casi-border)', borderRadius:8, padding:'4px 10px', color:'var(--casi-text-muted)', cursor:cleanupBusy?'default':'pointer', opacity:cleanupBusy?0.5:1 }}
                    title="Probe each escrow and clear rows whose funds already left the vault"
                  >
                    {cleanupBusy ? '…' : 'Clean up ended'}
                  </button>
                )}
              </div>
              <div className="my-beams-list">
                {visibleMyBookings.map((booking: any) => {
                  const isLive     = booking.status==='active';
                  const isApproved = booking.status==='approved_queued';
                  const isPending  = booking.status==='pending';
                  const isDenied   = booking.status==='denied';
                  const isExpired  = booking.status==='expired';
                  const isSolanaLocked = isDenied && booking.payment_method === 'solana' && booking.escrow_pda;
                  // Kick-leaked: streamer ended the beam but the on-chain
                  // settle didn't go through, so the PDA still holds funds.
                  // Visually distinct from a plain denial because the viewer
                  // is owed a prorated refund, not a full one.
                  const isSolanaKickLeaked = isExpired && booking.payment_method === 'solana' && booking.escrow_pda;
                  const isExpiring = isLive && expiringSoon.has(booking.id);
                  const activeBooking = activeBookings.find((b:any) => b.id===booking.id);
                  const canCancel = isPending || isApproved;
                  const needsRecover = isSolanaLocked || isSolanaKickLeaked;
                  const chipStyle = isExpiring
                    ? { background:'rgba(234,179,8,0.08)', borderColor:'rgba(234,179,8,0.25)', color:'#facc15' }
                    : isLive
                    ? { background:`rgba(${tcRgb},0.07)`, borderColor:`rgba(${tcRgb},0.21)`, color:tc }
                    : isApproved
                    ? { background:`rgba(${tcRgb},0.06)`, borderColor:`rgba(${tcRgb},0.19)`, color:tc }
                    : needsRecover
                    ? { background:'rgba(192,132,252,0.06)', borderColor:'rgba(192,132,252,0.25)', color:'#c084fc' }
                    : isDenied
                    ? { background:'rgba(248,113,113,0.06)', borderColor:'rgba(248,113,113,0.22)', color:'#f87171' }
                    : { background:'rgba(255,255,255,0.03)', borderColor:'var(--casi-border)', color:'var(--casi-text-muted)' };
                  return (
                    <div key={booking.id} className="beam-chip" style={chipStyle}>
                      {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width:20, height:20, objectFit:'contain', borderRadius:4 }} />}
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500 }}>
                        {isExpiring?'⚠ Expiring':isLive?'● Live':isApproved?'⏳ Queued':isSolanaKickLeaked?'⚡ Ended early — USDC recoverable':isSolanaLocked?'✕ Denied — USDC locked':isDenied?'✕ Denied — refund on the way':'⌛ Pending'}
                      </span>
                      {isLive && activeBooking && (
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, opacity:0.7 }}>
                          <Countdown booking={activeBooking}
                            onWarning={(s) => {
                              if(s<=300&&s>0) setExpiringSoon(prev=>new Set(prev).add(booking.id));
                              else if(s<=0) setExpiringSoon(prev=>{const n=new Set(prev);n.delete(booking.id);return n;});
                            }}
                            onExpire={() => clientExpireBooking(activeBooking)}
                          />
                        </span>
                      )}
                      {isLive && (
  <button className="cancel-btn" onClick={async () => {
    if (booking.payment_method === 'solana') {
      // settle_beam pays streamer the vested portion on-chain and refunds
      // the viewer the rest in a single tx. DB is updated after to advance
      // the queue; settleSolanaBeam already surfaces its own toast on error.
      await settleSolanaBeam(booking);
      await clientExpireBooking(activeBooking);   // clear slot + advance queue
    } else {
      await fetch('/api/stripe/end-early', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id }),
      });
      await clientExpireBooking(activeBooking);
      showNotif('Beam ended — prorated refund issued', 'warning');
    }
  }}>
    ✕ end early
  </button>
)}
                      {canCancel && (
                        <button className="cancel-btn" onClick={() => cancelBooking(booking.id)} disabled={cancelling===booking.id}>
                          {cancelling===booking.id?'…':'✕ cancel'}
                        </button>
                      )}
                      {needsRecover && (
                        <button className="cancel-btn" style={{ color: '#c084fc', borderColor: 'rgba(192,132,252,0.3)' }}
                          onClick={() => reclaimSolanaEscrow(booking)}>
                          ◎ recover USDC
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STREAM CANVAS */}
          <div className={isOBS ? '' : 'stream-canvas'} style={isOBS ? { position:'relative', width:'100vw', height:'100vh' } : {}}>
            {/* Silhouette preview background — visible to viewers while booking, never in OBS */}
            {!isOBS && selectedSlot && profile?.preview_background_url && (
              <img
                src={profile.preview_background_url}
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.35, pointerEvents:'none', zIndex:5 }}
                alt=""
              />
            )}
            {elements.map((el: any) => {
              const activeBooking   = getActiveBookingForSlot(el.id);
              const isOccupied      = !!activeBooking;
              const queueCount      = queueCounts[el.id]||0;
              const isSelected      = selectedSlot?.id===el.id;
              const myBookingForSlot = getMyBookingForSlot(el.id);
              const myIsExpiring    = myBookingForSlot && expiringSoon.has(myBookingForSlot.id);
              const isLocked        = !!el.locked;
              // Viewer has a preview ready (upload or validated URL)
              const viewerHasPreview = isSelected && (
                (uploadMode === 'upload' && !!uploadedUrl) ||
                (uploadMode === 'url' && imageValid && !!imageUrl)
              );
              const displayImage: string|null = viewerHasPreview
                ? (uploadMode === 'upload' ? uploadedUrl! : imageUrl)
                : (el.image_url || null);
              const displayFileType: 'image'|'video'|null = viewerHasPreview
                ? (uploadMode === 'upload' ? uploadedFileType : getUrlFileType(imageUrl))
                : (activeBooking?.file_type ?? null);
              const showExtend = myBookingForSlot?.status==='active' && expiringSoon.has(myBookingForSlot.id) && canExtend(el.id);

              // Keying the media container on activeBooking.id re-mounts it
              // on every pending→active transition so `.beam-glow`'s CSS
              // animation plays fresh. Key stays stable while a single beam
              // is live, then changes on the next one.
              const mediaKey = `${el.id}-${activeBooking?.id ?? 'none'}`;
              const shapeClass =
                el.shape === 'rounded' ? 'beam-shape-rounded' :
                el.shape === 'circle'  ? 'beam-shape-circle'  :
                el.shape === 'hex'     ? 'beam-shape-hex'     :
                '';
              const glowClass = isOccupied && (el.glow_on_start ?? true) && !el.is_background ? 'beam-glow' : '';

              // Banner slots render the viewer's message as a scrolling
              // marquee in place of the normal image/video content. Falls
              // back to the regular media path if the slot is a banner but
              // no booking is active (just show the empty placeholder).
              const isBannerActive = el.shape === 'banner' && isOccupied && !!activeBooking?.message;

              return (
                <div key={el.id} style={{ position:'absolute', left:`${el.pos_x}%`, top:`${el.pos_y}%`, width:`${el.width}%`, height:`${el.height}%`, zIndex:el.is_background?10:50, transition:'all 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
                  {isBannerActive ? (
                    <div key={mediaKey} className={`beam-banner ${glowClass}`.trim()}>
                      <span className="beam-banner-track">{activeBooking.message}</span>
                    </div>
                  ) : displayImage ? (
                    <div key={mediaKey} className={`${shapeClass} ${glowClass}`.trim()} style={{ position:'relative', width:'100%', height:'100%' }}>
                      {/* Backdrop fills (cover, crop as needed). Beam slots
                          preserve the viewer's aspect ratio (contain) —
                          `fill` stretches to the slot and visibly squishes
                          any upload whose AR differs from the slot's. */}
                      {displayFileType === 'video'
                        ? <video key={displayImage} src={displayImage} autoPlay loop muted playsInline style={{ width:'100%', height:'100%', objectFit:el.is_background?'cover':'contain', pointerEvents:'none', opacity: viewerHasPreview && !isOBS ? 0.65 : 1 }} />
                        : <img key={displayImage ?? 'empty'} src={displayImage} style={{ width:'100%', height:'100%', objectFit:el.is_background?'cover':'contain', pointerEvents:'none', opacity: viewerHasPreview && !isOBS ? 0.65 : 1 }} alt="" />
                      }
                      {viewerHasPreview && !isOBS && <div style={{ position:'absolute', inset:0, borderRadius:4, boxShadow:`inset 0 0 0 2px rgba(${accentColorRgb},0.5)`, pointerEvents:'none' }} />}
                    </div>
                  ) : el.shape === 'banner' && !isOccupied && !isLocked && !isOBS ? (
                    // Empty banner on the viewer overlay (but NOT on OBS —
                    // stream shouldn't show placeholder text permanently).
                    // Scroll a soft "tip to try" message so viewers can see
                    // what the slot will do before they send a flash.
                    <div className="beam-banner" style={{ opacity: 0.5, borderColor: `rgba(${tcRgb}, 0.3)` }}>
                      <span className="beam-banner-track" style={{ color: `rgba(${tcRgb}, 0.7)` }}>
                        ▰ Banner · your message scrolls here · tip to try
                      </span>
                    </div>
                  ) : (
                    <div className={shapeClass} style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:el.is_background?12:6, border:`1.5px dashed ${isLocked?'rgba(248,113,113,0.3)':isOccupied?`rgba(${tcRgb},0.31)`:el.is_background?'rgba(168,85,247,0.3)':`rgba(${tcRgb},0.25)`}`, background:isLocked?'rgba(248,113,113,0.03)':isOccupied?`rgba(${tcRgb},0.02)`:el.is_background?'rgba(168,85,247,0.03)':`rgba(${tcRgb},0.02)` }}>
                      <span style={{ fontSize:el.is_background?20:14, marginBottom:4 }}>{isLocked?'🔒':isOccupied?(el.shape==='banner'?'▰':''):el.is_background?'🖼':el.shape==='banner'?'▰':'✦'}</span>
                      {isOccupied && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:`rgba(${tcRgb},0.69)` }}><Countdown booking={activeBooking} onExpire={() => clientExpireBooking(activeBooking)} /></span>}
                    </div>
                  )}

                  {el.price_value >= 0 && !isOBS && (
                    <div style={{ position:'absolute', bottom:el.is_background?12:-54, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:5, zIndex:100, whiteSpace:'nowrap' }}>
                      <div style={{ background:'rgba(5,5,5,0.92)', border:`1px solid ${Number(el.price_value)===0?'rgba(74,222,128,0.35)':'rgba(255,255,255,0.08)'}`, borderRadius:20, padding:'3px 10px', display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500, color: Number(el.price_value)===0 ? '#4ade80' : tc }}>
                          {Number(el.price_value)===0 ? '★ Free' : `$${el.price_value}/${el.price_unit}`}
                        </span>
                        {el.max_duration_minutes && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'#444' }}>· max {el.max_duration_minutes}m</span>}
                      </div>
                      {isLocked ? (
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'rgba(248,113,113,0.5)', padding:'3px 8px', border:'1px solid rgba(248,113,113,0.15)', borderRadius:20 }}>🔒 Locked</span>
                      ) : myBookingForSlot ? (
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:'3px 10px', borderRadius:20, border:'1px solid', ...(myIsExpiring?{color:'#facc15',borderColor:'rgba(234,179,8,0.3)',background:'rgba(234,179,8,0.08)'}:myBookingForSlot.status==='active'?{color:tc,borderColor:`rgba(${tcRgb},0.31)`,background:`rgba(${tcRgb},0.07)`}:myBookingForSlot.status==='approved_queued'?{color:tc,borderColor:`rgba(${tcRgb},0.25)`,background:`rgba(${tcRgb},0.06)`}:{color:'var(--casi-text-muted)',borderColor:'var(--casi-border)',background:'rgba(255,255,255,0.03)'}) }}>
                            {myIsExpiring?'⚠ Expiring':myBookingForSlot.status==='active'?'● Your beam is live':myBookingForSlot.status==='approved_queued'?'⏳ Queued':'⌛ Pending'}
                          </span>
                          {showExtend && (
                            <button onClick={() => openSlot(el, false, true)}
                              style={{ background:'#eab308', border:'none', borderRadius:20, padding:'4px 12px', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:10, textTransform:'uppercase', color:'var(--casi-bg)', cursor:'pointer' }}>
                              Extend
                            </button>
                          )}
                          {myIsExpiring && !canExtend(el.id) && (
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'rgba(234,179,8,0.5)' }}>Next viewer waiting</span>
                          )}
                        </div>
                      ) : isOccupied ? (
                        <button onClick={() => openSlot(el, true)}
                          style={{ background:tc, border:'none', borderRadius:20, padding:'5px 14px', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11, textTransform:'uppercase', color:'var(--casi-bg)', cursor:'pointer' }}>
                          Join queue{queueCount>0?` (${queueCount})`:''}
                        </button>
                      ) : !selectedSlot ? (
                        <button onClick={() => openSlot(el, false)}
                          style={{ background: Number(el.price_value)===0 ? '#4ade80' : tc, border:'none', borderRadius:20, padding:'5px 14px', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11, textTransform:'uppercase', color:'var(--casi-bg)', cursor:'pointer', boxShadow: Number(el.price_value)===0 ? '0 4px 14px rgba(74,222,128,0.19)' : `0 4px 14px rgba(${tcRgb},0.19)` }}>
                          {Number(el.price_value)===0 ? 'Claim free slot' : 'Tip for this slot'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Flash Feed — overlaid on canvas in OBS mode */}
            {isOBS && profile?.id && <FlashFeed profileId={profile.id} />}
          </div>

          {/* BOOKING FORM */}
          {!isOBS && selectedSlot && (
            <div className="bf" style={{ border:`1px solid rgba(${accentColorRgb},0.13)` }}>
              <div className="bf-hdr">
                <div>
                  <div className="bf-type" style={{ color:accentColor }}>{isExtend?'⏱ Extend slot':isQueue?'⏳ Join queue':'🎯 Tip for slot'}</div>
                  <div className="bf-price" style={{ color: Number(selectedSlot.price_value)===0 ? '#4ade80' : accentColor }}>
                    {Number(selectedSlot.price_value)===0 ? '★ Free' : `$${selectedSlot.price_value}/${selectedSlot.price_unit}`}
                  </div>
                </div>
                <button className="bf-x" onClick={closeSlot}>✕</button>
              </div>
              <div className="bf-grid">
                <div>
                  <div style={{ marginBottom:14 }}>
                    <label className="bf-lbl">Beam media</label>
                    {/* Mode toggle */}
                    <div style={{ display:'flex', gap:0, marginBottom:8, border:'1px solid var(--casi-border)', borderRadius:8, overflow:'hidden' }}>
                      {(['upload','url'] as const).map(m => (
                        <button key={m} onClick={() => setUploadMode(m)}
                          style={{ flex:1, padding:'5px 0', background: uploadMode===m ? accentColor : 'transparent', color: uploadMode===m ? 'var(--casi-bg)' : '#555', border:'none', fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:1, textTransform:'uppercase', cursor:'pointer', fontWeight: uploadMode===m ? 700 : 400 }}>
                          {m === 'upload' ? '↑ Upload' : '⇥ Link'}
                        </button>
                      ))}
                    </div>

                    {uploadMode === 'upload' ? (
                      /* ── File upload mode ── */
                      <div>
                        <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, border:`1.5px dashed ${uploadedUrl ? `rgba(${accentColorRgb},0.4)` : 'var(--casi-border)'}`, borderRadius:8, padding:'18px 12px', cursor: uploading ? 'wait' : 'pointer', background: uploadedUrl ? `rgba(${accentColorRgb},0.04)` : 'transparent', transition:'border-color .15s' }}>
                          <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" style={{ display:'none' }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                          <span style={{ fontSize:18 }}>{uploading ? '⟳' : uploadedUrl ? (uploadedFileType === 'video' ? '▶' : '🖼') : '↑'}</span>
                          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color: uploadedUrl ? accentColor : '#555', letterSpacing:0.5, textAlign:'center' }}>
                            {uploading ? 'Uploading…' : uploadedUrl ? `✓ ${uploadedFileType === 'video' ? 'Video' : 'Image'} ready` : 'Click to upload · img 5 MB · video 20 MB'}
                          </span>
                          {!uploadedUrl && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'#444' }}>jpg · png · gif · webp · mp4 · webm</span>}
                        </label>
                        {uploadedUrl && (
                          <button onClick={() => { setUploadedUrl(null); setUploadedPath(null); setUploadedFileType(null); }}
                            style={{ background:'none', border:'none', fontFamily:"'DM Mono',monospace", fontSize:9, color:'#f87171', cursor:'pointer', marginTop:4 }}>
                            ✕ Remove
                          </button>
                        )}
                      </div>
                    ) : (
                      /* ── URL link mode (HTTPS only) ── */
                      <div>
                        <input type="text" value={imageUrl} placeholder="https://your-image.png or .gif"
                          className="bf-inp"
                          style={{ borderColor: imageUrl ? (imageValid ? `rgba(${accentColorRgb},0.31)` : !imageUrl.startsWith('https://') ? '#f87171' : undefined) : undefined }}
                          onChange={(e) => { setImageUrl(e.target.value); setImageValid(false); }} />
                        {/* Hidden validators — img for images, video for video URLs */}
                        {imageUrl && getUrlFileType(imageUrl) === 'image' && (
                          <img src={imageUrl} style={{ display:'none' }} alt="" onLoad={() => setImageValid(true)} onError={() => setImageValid(false)} />
                        )}
                        {imageUrl && getUrlFileType(imageUrl) === 'video' && (
                          <video src={imageUrl} style={{ display:'none' }} muted onLoadedMetadata={() => setImageValid(true)} onError={() => setImageValid(false)} />
                        )}
                        <div className="bf-hint" style={{ color: !imageUrl ? '#444' : !imageUrl.startsWith('https://') ? '#f87171' : imageValid ? accentColor : '#f87171' }}>
                          {!imageUrl ? 'Paste a direct HTTPS image or GIF URL'
                            : !imageUrl.startsWith('https://') ? '⚠ Only HTTPS URLs are accepted'
                            : imageValid ? '✓ Media loaded'
                            : 'Media not loading — check the URL'}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="bf-lbl">Viewing as</label>
                    <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--casi-bg)', border:'1px solid var(--casi-border)', borderRadius:10, padding:'10px 14px' }}>
                      <span className="vdot" />
                      <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, flex:1 }}>@{savedViewerName}</span>
                      <button onClick={() => setShowChangeName(true)} style={{ background:'none', border:'none', fontFamily:"'DM Mono',monospace", fontSize:9, color:'#444', cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>change</button>
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ marginBottom:14 }}>
                    {(() => {
                      const maxSecs = selectedSlot.max_duration_minutes ? selectedSlot.max_duration_minutes * 60 : null;
                      const presets = [
                        { label:'30s', secs:30 },
                        { label:'1m',  secs:60 },
                        { label:'2m',  secs:120 },
                        { label:'5m',  secs:300 },
                        { label:'10m', secs:600 },
                        { label:'30m', secs:1800 },
                      ].filter(p => !maxSecs || p.secs <= maxSecs);
                      return (
                        <>
                          <label className="bf-lbl">Duration{maxSecs ? ` — max ${selectedSlot.max_duration_minutes}m` : ''}</label>
                          {/* Stepper row */}
                          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                            <button onClick={() => setDurationSecsClamped(durationSeconds - 5)}
                              style={{ width:36, height:36, borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--casi-text)', fontSize:15, cursor:'pointer', flexShrink:0 }}>−</button>
                            <div style={{ flex:1, textAlign:'center', fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:'var(--casi-text)', letterSpacing:1 }}>
                              {formatTime(durationSeconds)}
                            </div>
                            <button onClick={() => setDurationSecsClamped(durationSeconds + 5)}
                              style={{ width:36, height:36, borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--casi-text)', fontSize:15, cursor:'pointer', flexShrink:0 }}>+</button>
                          </div>
                          {/* Preset chips */}
                          <div className="dur-row">
                            {presets.map(p => (
                              <button key={p.secs} className="dur-btn"
                                style={durationSeconds===p.secs?{background:accentColor,borderColor:accentColor,color:'var(--casi-bg)',fontWeight:700}:{}}
                                onClick={() => setDurationSecsClamped(p.secs)}>{p.label}</button>
                            ))}
                          </div>
                          {/* Custom duration input */}
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:1, color:'#555', textTransform:'uppercase' }}>Custom</span>
                            <input
                              type="number" min="0.5" step="0.5" placeholder="minutes"
                              style={{ width:80, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'5px 8px', fontSize:12, color:'var(--casi-text)', fontFamily:"'DM Mono',monospace", outline:'none', textAlign:'center', MozAppearance:'textfield' } as React.CSSProperties}
                              onFocus={(e) => e.target.style.borderColor='rgba(var(--casi-accent-rgb),0.38)'}
                              onBlur={(e) => {
                                e.target.style.borderColor='rgba(255,255,255,0.08)';
                                const mins = parseFloat(e.target.value);
                                if (!isNaN(mins) && mins > 0) { setDurationSecsClamped(Math.round(mins * 60)); e.target.value = ''; }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const mins = parseFloat((e.target as HTMLInputElement).value);
                                  if (!isNaN(mins) && mins > 0) { setDurationSecsClamped(Math.round(mins * 60)); (e.target as HTMLInputElement).value = ''; }
                                }
                              }}
                            />
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#555' }}>min</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    {/* Banner slots render the viewer's message as a scrolling
                        marquee on the overlay, so the text becomes load-
                        bearing content (not an optional aside). Server-side
                        validation at /api/bookings/create-* also requires
                        message ≠ null for banner slots and caps length. */}
                    {selectedSlot?.shape === 'banner' ? (
                      <>
                        <label className="bf-lbl">Your scrolling message · required</label>
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value.slice(0, BANNER_MAX_MESSAGE))}
                          placeholder="What should scroll across the banner?"
                          rows={2}
                          maxLength={BANNER_MAX_MESSAGE}
                          className="bf-inp"
                          style={{ resize:'none' }}
                        />
                        <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontFamily:"'DM Mono',monospace", fontSize:9, color: message.length > BANNER_MAX_MESSAGE * 0.85 ? '#facc15' : '#555' }}>
                          <span>Shows as a live scroll on stream</span>
                          <span>{message.length}/{BANNER_MAX_MESSAGE}</span>
                        </div>
                        {message.trim().length > 0 && (
                          <div style={{ marginTop:10, padding:0, borderRadius:6, overflow:'hidden', background:'rgba(0,0,0,0.65)', border:'1px solid rgba(var(--casi-accent-rgb),0.25)' }}>
                            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:8, letterSpacing:2, textTransform:'uppercase', color:'#555', padding:'6px 10px 0' }}>Preview</div>
                            <div className="beam-banner" style={{ height:44, borderTop:'none', borderBottom:'none' }}>
                              <span className="beam-banner-track" style={{ fontSize:20 }}>{message}</span>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <label className="bf-lbl">Message (optional)</label>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                          placeholder="Anything for the streamer…" rows={3}
                          className="bf-inp" style={{ resize:'none' }} />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── USDC cost preview (paid slots only) ── */}
              {Number(selectedSlot.price_value) > 0 && (
              <div style={{ background:'rgba(153,69,255,0.05)', border:'1px solid rgba(153,69,255,0.2)', borderRadius:10, padding:'12px 14px', margin:'12px 0', fontFamily:"'DM Mono',monospace", fontSize:11 }}>
                {[['Duration', formatTime(durationSeconds)], ['Rate', `$${selectedSlot.price_value}/${selectedSlot.price_unit}`]].map(([l, v]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', color:'#555', marginBottom:5 }}>
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid #1c1c1c', paddingTop:8, marginTop:4, fontSize:13, fontWeight:700, color:'#9945FF' }}>
                  <span>Total</span><span>{estimatedCost} USDC</span>
                </div>
                {connected && usdcBalance !== null ? (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, color:'#555' }}>
                      <span>Your balance</span>
                      <span style={{ color: usdcBalance < parseFloat(estimatedCost) ? '#f87171' : '#6ee7b7' }}>
                        {usdcBalance.toFixed(2)} USDC
                      </span>
                    </div>
                    {usdcBalance < parseFloat(estimatedCost) && (
                      <div style={{ color:'#f87171', fontSize:10, marginTop:5, textAlign:'right' }}>⚠ Insufficient balance</div>
                    )}
                  </>
                ) : connected ? (
                  <div style={{ color:'#555', fontSize:10, marginTop:6 }}>Fetching balance…</div>
                ) : (
                  <div style={{ color:'#555', fontSize:10, marginTop:6 }}>Connect wallet to pay with USDC on-chain</div>
                )}
              </div>
              )}

{isQueue && (() => {
  const active = activeBookings.find(b => b.element_id === selectedSlot?.id);
  if (!active) return null;
  const remaining = getSecondsRemaining(active) / 60;
  const queue = approvedQueuedBookings.filter(b => b.element_id === selectedSlot?.id);
  const queueMinutes = queue.reduce((sum, b) => sum + Number(b.duration_minutes), 0);
  const wait = Math.round(remaining + queueMinutes);
  const ahead = queue.length;
  return (
    <div style={{ background: `rgba(${tcRgb},0.06)`, border: `1px solid rgba(${tcRgb},0.15)`, borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 4 }}>Estimated wait</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--casi-accent)' }}>~{wait} min</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#555', marginTop: 2 }}>{ahead} booking{ahead !== 1 ? 's' : ''} ahead of you</div>
    </div>
  );
})()}
              {(() => {
                const isFreeSlot = Number(selectedSlot.price_value) === 0;
                const freeBlocked = isFreeSlot && !turnstileToken;
                return (
                <>
                {isFreeSlot && (
                  <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
                    <TurnstileWidget
                      onVerify={onTurnstileVerify}
                      onExpire={onTurnstileExpire}
                      theme="dark"
                      compact
                    />
                  </div>
                )}
                <div className="bf-footer">
                  <div>
                    <div className="bf-cost-lbl">{isFreeSlot ? 'Cost' : 'Estimated cost'}</div>
                    <div className="bf-cost-val" style={{ color: isFreeSlot ? '#4ade80' : accentColor }}>
                      {isFreeSlot ? 'Free' : `$${estimatedCost}`}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    {/* ── Stripe / Free ── */}
                    <button onClick={submitBooking} disabled={!canSubmit||submitting||freeBlocked} className="bf-sub"
                      style={{ background: isFreeSlot ? '#4ade80' : accentColor, color:'var(--casi-bg)', display:'flex', alignItems:'center', gap:7, opacity: (!canSubmit||submitting||freeBlocked) ? 0.5 : 1 }}>
                      {isFreeSlot ? (
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6.5 1l1.545 3.13L11.5 4.635 9 7.073l.59 3.442L6.5 8.89 3.41 10.515 4 7.073 1.5 4.635l3.455-.505L6.5 1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <svg width="14" height="11" viewBox="0 0 14 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="0.5" y="0.5" width="13" height="10" rx="1.5" stroke="currentColor" strokeOpacity="0.6"/>
                          <rect x="0" y="3" width="14" height="2.5" fill="currentColor" fillOpacity="0.5"/>
                          <rect x="2" y="7" width="4" height="1.5" rx="0.5" fill="currentColor"/>
                        </svg>
                      )}
                      {submitting?'Sending…':isExtend?'Extend':isFreeSlot?(isQueue?'Join Free Queue':'Send Free Request'):isQueue?'Join Queue':'Send Request'}
                    </button>
                    {/* ── Solana / CASI escrow (hidden for free slots) ── */}
                    {!isFreeSlot && (
                      <button
                        disabled={connecting || submitting || (connected && !canSubmit)}
                        className="bf-sub"
                        style={{ background: connected ? '#9945FF' : 'rgba(153,69,255,0.12)', color: connected ? '#fff' : '#9945FF', border: connected ? 'none' : '1px solid rgba(153,69,255,0.35)', display:'flex', alignItems:'center', gap:7, opacity: (connecting||submitting||(connected&&!canSubmit)) ? 0.5 : 1 }}
                        onClick={() => {
                          if (!connected) {
                            openWalletModal();
                          } else {
                            setTxStatus('idle'); setTxError(null); setShowConfirmModal(true);
                          }
                        }}
                      >
                        <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M1.5 8.5h8.8c.15 0 .28.06.38.16l1.1 1.1c.14.14.04.37-.17.37H2.8c-.15 0-.28-.06-.38-.16L1.33 8.87c-.14-.14-.04-.37.17-.37ZM1.5 0h8.8c.15 0 .28.06.38.16l1.1 1.1c.14.14.04.37-.17.37H2.8c-.15 0-.28-.06-.38-.16L1.33.37C1.19.23 1.29 0 1.5 0ZM11.67 4.37 10.58 5.5H1.82c-.21 0-.31-.23-.17-.37l1.1-1.1c.1-.1.23-.16.38-.16h8.37c.21 0 .31.23.17.37Z" fill="currentColor"/>
                        </svg>
                        {connecting ? 'Connecting…' : connected ? 'Pay with SOL' : 'Connect & Pay SOL'}
                      </button>
                    )}
                  </div>
                </div>
                </>
                );
              })()}
            </div>
          )}

          {/* SLOTS LIST */}
          {!isOBS && !selectedSlot && elements.filter((el:any)=>el.price_value>=0).length>0 && (
            <div className="slots-sec">
              <div className="slots-lbl">Available slots</div>
              <div className="slots-grid">
                {elements.filter((el:any)=>el.price_value>=0).map((el:any) => {
                  const activeBooking    = getActiveBookingForSlot(el.id);
                  const isOccupied       = !!activeBooking;
                  const queueCount       = queueCounts[el.id]||0;
                  const myBookingForSlot = getMyBookingForSlot(el.id);
                  const isLocked         = !!el.locked;
                  const isFree           = Number(el.price_value) === 0;
                  const priceColor       = isLocked?'#555':myBookingForSlot?'#555':isFree?'#4ade80':tc;
                  return (
                    <button key={el.id} className={`slot-card ${myBookingForSlot||isLocked?'s-disabled':''}`}
                      style={{ borderColor:isFree?'rgba(74,222,128,0.22)':isOccupied&&!myBookingForSlot&&!isLocked?`rgba(${tcRgb},0.14)`:!myBookingForSlot&&!isLocked?`rgba(${tcRgb},0.09)`:undefined, position:'relative' }}
                      onClick={() => !myBookingForSlot&&!isLocked&&openSlot(el,isOccupied)}>
                      {isFree && !isLocked && (
                        <span style={{ position:'absolute', top:8, right:8, background:'rgba(74,222,128,0.14)', border:'1px solid rgba(74,222,128,0.4)', color:'#4ade80', fontFamily:"'DM Mono', monospace", fontSize:8, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', padding:'2px 7px', borderRadius:4, pointerEvents:'none' }}>
                          ★ Free
                        </span>
                      )}
                      <div className="s-thumb" style={{ borderColor:isFree?'rgba(74,222,128,0.25)':isOccupied?`rgba(${tcRgb},0.21)`:`rgba(${tcRgb},0.14)` }}>
                        {el.image_url?<SlotMedia src={el.image_url} fileType={null} style={{ width:'100%',height:'100%',objectFit:'contain' }} />:<span>{isLocked?'🔒':el.is_background?'🖼':'✦'}</span>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div className="s-type">{isLocked?'Locked':myBookingForSlot?String(myBookingForSlot.status||'pending').replace('_',' '):isOccupied?`In use${queueCount>0?` · ${queueCount} waiting`:''}`:el.is_background?'Full Backdrop':'Beam'}</div>
                        <div className="s-price" style={{ color:priceColor }}>
                          {isFree ? 'Free' : `$${el.price_value}/${el.price_unit}`}
                          {el.max_duration_minutes?` · max ${el.max_duration_minutes}m`:''}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Flash feed + composer. FlashPanel is the single "chat-box-but-
              for-flashes" surface: renders approved flashes chat-style AND
              embeds the SendFlashSection composer inline. No separate
              send-a-flash card above it, no plain text chat — CASI is
              deliberately flash-only. FlashPanel hides the composer when
              a slot booking form is open so the two modals don't fight for
              focus. Rail gating is handled inside FlashPanel via
              streamerProfile. */}
          {!isOBS && profile?.id && !selectedSlot && (
            <div style={{ marginTop:24 }}>
              <FlashPanel
                profileId={profile.id}
                viewerName={savedViewerName || null}
                streamerProfile={profile}
                username={username}
                showNotif={showNotif}
              />
            </div>
          )}

          {!isOBS && (
            <div style={{ marginTop:36, paddingTop:20, borderTop:'1px solid var(--casi-surface)', textAlign:'center' }}>
              <a href="/search" style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#222', textDecoration:'none' }}>
                Browse other streams →
              </a>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:20 }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:1.5, textTransform:'uppercase', color:'#888' }}>Powered by</span>
                {/* CASI escrow — on-chain Solana program */}
                <svg width="14" height="14" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="sf-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#9945FF"/>
                      <stop offset="100%" stopColor="#6E3FD4"/>
                    </linearGradient>
                  </defs>
                  <path d="M15 30 Q50 10 85 30 Q50 50 15 30Z" fill="url(#sf-grad)"/>
                  <path d="M15 50 Q50 30 85 50 Q50 70 15 50Z" fill="url(#sf-grad)" opacity="0.75"/>
                  <path d="M15 70 Q50 50 85 70 Q50 90 15 70Z" fill="url(#sf-grad)" opacity="0.5"/>
                </svg>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:1.5, textTransform:'uppercase', color:'#888' }}>Solana</span>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Solana confirmation modal */}
      {showConfirmModal && selectedSlot && (
        <SolanaConfirmModal
          slot={selectedSlot}
          duration={durationSeconds / 60}
          estimatedCost={estimatedCost}
          username={username}
          recipientWallet={profile?.solana_wallet ?? null}
          usdcBalance={usdcBalance}
          txStatus={txStatus}
          txError={txError}
          txId={confirmedTxId}
          submitting={submitting}
          onConfirm={submitSolanaBooking}
          onCancel={() => { if (!submitting) { setShowConfirmModal(false); setTxStatus('idle'); setTxError(null); setConfirmedTxId(null); } }}
        />
      )}
    </>
  );
}

export default function PerfectOverlay() {
  return <Suspense fallback={null}><OverlayContent /></Suspense>;
}
