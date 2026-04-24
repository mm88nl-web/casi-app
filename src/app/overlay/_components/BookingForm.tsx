'use client';

import { BANNER_MAX_MESSAGE } from '@/lib/banner';
import TurnstileWidget from '@/components/TurnstileWidget';
import { formatTime, getSecondsRemaining } from './time';

type Slot = {
  id: string | number;
  price_value: number | string;
  price_unit: string;
  max_duration_minutes?: number | null;
  shape?: string | null;
};

type Booking = { id: string | number; element_id?: string | null; duration_minutes?: number | string | null };

type Props = {
  slot: Slot;
  accentColor: string;
  accentColorRgb: string;
  tcRgb: string;
  isExtend: boolean;
  isQueue: boolean;
  savedViewerName: string;
  onChangeNameClick: () => void;
  onClose: () => void;

  // Media
  uploadMode: 'upload' | 'url';
  onUploadModeChange: (m: 'upload' | 'url') => void;
  uploadedUrl: string | null;
  uploadedFileType: 'image' | 'video' | null;
  uploading: boolean;
  onFileSelect: (f: File) => void;
  onRemoveUpload: () => void;
  imageUrl: string;
  imageValid: boolean;
  onImageUrlChange: (url: string) => void;
  onImageValidChange: (valid: boolean) => void;
  getUrlFileType: (url: string) => 'image' | 'video' | null;

  // Duration
  durationSeconds: number;
  onDurationChange: (secs: number) => void;

  // Message
  message: string;
  onMessageChange: (m: string) => void;

  // Cost / wallet
  estimatedCost: string;
  walletConnected: boolean;
  usdcBalance: number | null;

  // Queue wait context (ignored when !isQueue)
  activeBookings: Booking[];
  approvedQueuedBookings: Booking[];

  // Turnstile (paid slots don't show it; only free)
  turnstileToken: string | null;
  onTurnstileVerify: (t: string) => void;
  onTurnstileExpire: () => void;

  // Submit
  canSubmit: boolean;
  submitting: boolean;
  connecting: boolean;
  onStripeSubmit: () => void;
  onSolanaPay: () => void;
};

export default function BookingForm(props: Props) {
  const {
    slot, accentColor, accentColorRgb, tcRgb,
    isExtend, isQueue, savedViewerName, onChangeNameClick, onClose,
    uploadMode, onUploadModeChange,
    uploadedUrl, uploadedFileType, uploading, onFileSelect, onRemoveUpload,
    imageUrl, imageValid, onImageUrlChange, onImageValidChange, getUrlFileType,
    durationSeconds, onDurationChange,
    message, onMessageChange,
    estimatedCost, walletConnected, usdcBalance,
    activeBookings, approvedQueuedBookings,
    turnstileToken, onTurnstileVerify, onTurnstileExpire,
    canSubmit, submitting, connecting, onStripeSubmit, onSolanaPay,
  } = props;

  const isFreeSlot = Number(slot.price_value) === 0;
  const freeBlocked = isFreeSlot && !turnstileToken;

  const maxSecs = slot.max_duration_minutes ? slot.max_duration_minutes * 60 : null;
  const presets = [
    { label: '30s', secs: 30 },
    { label: '1m',  secs: 60 },
    { label: '2m',  secs: 120 },
    { label: '5m',  secs: 300 },
    { label: '10m', secs: 600 },
    { label: '30m', secs: 1800 },
  ].filter(p => !maxSecs || p.secs <= maxSecs);

  const queueWait = (() => {
    if (!isQueue) return null;
    const active = activeBookings.find(b => b.element_id === slot.id);
    if (!active) return null;
    const remaining = getSecondsRemaining(active) / 60;
    const queue = approvedQueuedBookings.filter(b => b.element_id === slot.id);
    const queueMinutes = queue.reduce((sum, b) => sum + Number(b.duration_minutes || 0), 0);
    return { wait: Math.round(remaining + queueMinutes), ahead: queue.length };
  })();

  return (
    <div className="bf" style={{ border: `1px solid rgba(${accentColorRgb},0.13)` }}>
      <div className="bf-hdr">
        <div>
          <div className="bf-type" style={{ color: accentColor }}>
            {isExtend ? '⏱ Extend slot' : isQueue ? '⏳ Join queue' : '🎯 Tip for slot'}
          </div>
          <div className="bf-price" style={{ color: isFreeSlot ? '#4ade80' : accentColor }}>
            {isFreeSlot ? '★ Free' : `$${slot.price_value}/${slot.price_unit}`}
          </div>
        </div>
        <button className="bf-x" onClick={onClose}>✕</button>
      </div>

      <div className="bf-grid">
        <div>
          <div style={{ marginBottom: 14 }}>
            <label className="bf-lbl">Beam media</label>
            <div style={{ display: 'flex', gap: 0, marginBottom: 8, border: '1px solid var(--casi-border)', borderRadius: 8, overflow: 'hidden' }}>
              {(['upload', 'url'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => onUploadModeChange(m)}
                  style={{ flex: 1, padding: '5px 0', background: uploadMode === m ? accentColor : 'transparent', color: uploadMode === m ? 'var(--casi-bg)' : '#555', border: 'none', fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontWeight: uploadMode === m ? 700 : 400 }}
                >
                  {m === 'upload' ? '↑ Upload' : '⇥ Link'}
                </button>
              ))}
            </div>

            {uploadMode === 'upload' ? (
              <div>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1.5px dashed ${uploadedUrl ? `rgba(${accentColorRgb},0.4)` : 'var(--casi-border)'}`, borderRadius: 8, padding: '18px 12px', cursor: uploading ? 'wait' : 'pointer', background: uploadedUrl ? `rgba(${accentColorRgb},0.04)` : 'transparent', transition: 'border-color .15s' }}>
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }}
                  />
                  <span style={{ fontSize: 18 }}>{uploading ? '⟳' : uploadedUrl ? (uploadedFileType === 'video' ? '▶' : '🖼') : '↑'}</span>
                  <span style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, color: uploadedUrl ? accentColor : '#555', letterSpacing: 0.5, textAlign: 'center' }}>
                    {uploading ? 'Uploading…' : uploadedUrl ? `✓ ${uploadedFileType === 'video' ? 'Video' : 'Image'} ready` : 'Click to upload · img 5 MB · video 20 MB'}
                  </span>
                  {!uploadedUrl && <span style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, color: '#444' }}>jpg · png · gif · webp · mp4 · webm</span>}
                </label>
                {uploadedUrl && (
                  <button
                    onClick={onRemoveUpload}
                    style={{ background: 'none', border: 'none', fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, color: '#f87171', cursor: 'pointer', marginTop: 4 }}
                  >
                    ✕ Remove
                  </button>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={imageUrl}
                  placeholder="https://your-image.png or .gif"
                  className="bf-inp"
                  style={{ borderColor: imageUrl ? (imageValid ? `rgba(${accentColorRgb},0.31)` : !imageUrl.startsWith('https://') ? '#f87171' : undefined) : undefined }}
                  onChange={(e) => { onImageUrlChange(e.target.value); onImageValidChange(false); }}
                />
                {imageUrl && getUrlFileType(imageUrl) === 'image' && (
                  <img src={imageUrl} style={{ display: 'none' }} alt="" onLoad={() => onImageValidChange(true)} onError={() => onImageValidChange(false)} />
                )}
                {imageUrl && getUrlFileType(imageUrl) === 'video' && (
                  <video src={imageUrl} style={{ display: 'none' }} muted onLoadedMetadata={() => onImageValidChange(true)} onError={() => onImageValidChange(false)} />
                )}
                <div className="bf-hint" style={{ color: !imageUrl ? '#444' : !imageUrl.startsWith('https://') ? '#f87171' : imageValid ? accentColor : '#f87171' }}>
                  {!imageUrl
                    ? 'Paste a direct HTTPS image or GIF URL'
                    : !imageUrl.startsWith('https://')
                    ? '⚠ Only HTTPS URLs are accepted'
                    : imageValid
                    ? '✓ Media loaded'
                    : 'Media not loading — check the URL'}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="bf-lbl">Viewing as</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '10px 14px' }}>
              <span className="vdot" />
              <span style={{ fontFamily: "var(--font-casi-sans),sans-serif", fontWeight: 700, fontSize: 14, flex: 1 }}>@{savedViewerName}</span>
              <button
                onClick={onChangeNameClick}
                style={{ background: 'none', border: 'none', fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, color: '#444', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}
              >
                change
              </button>
            </div>
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 14 }}>
            <label className="bf-lbl">Duration{maxSecs ? ` — max ${slot.max_duration_minutes}m` : ''}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <button
                onClick={() => onDurationChange(durationSeconds - 5)}
                style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--casi-text)', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}
              >−</button>
              <div style={{ flex: 1, textAlign: 'center', fontFamily: "var(--font-casi-mono),monospace", fontSize: 20, fontWeight: 700, color: 'var(--casi-text)', letterSpacing: 1 }}>
                {formatTime(durationSeconds)}
              </div>
              <button
                onClick={() => onDurationChange(durationSeconds + 5)}
                style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--casi-text)', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}
              >+</button>
            </div>
            <div className="dur-row">
              {presets.map(p => (
                <button
                  key={p.secs}
                  className="dur-btn"
                  style={durationSeconds === p.secs ? { background: accentColor, borderColor: accentColor, color: 'var(--casi-bg)', fontWeight: 700 } : {}}
                  onClick={() => onDurationChange(p.secs)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, letterSpacing: 1, color: '#555', textTransform: 'uppercase' }}>Custom</span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                placeholder="minutes"
                style={{ width: 80, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '5px 8px', fontSize: 12, color: 'var(--casi-text)', fontFamily: "var(--font-casi-mono),monospace", outline: 'none', textAlign: 'center', MozAppearance: 'textfield' } as React.CSSProperties}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(var(--casi-accent-rgb),0.38)')}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.08)';
                  const mins = parseFloat(e.target.value);
                  if (!isNaN(mins) && mins > 0) { onDurationChange(Math.round(mins * 60)); e.target.value = ''; }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const mins = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(mins) && mins > 0) { onDurationChange(Math.round(mins * 60)); (e.target as HTMLInputElement).value = ''; }
                  }
                }}
              />
              <span style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, color: '#555' }}>min</span>
            </div>
          </div>

          <div>
            {/* Banner slots render the viewer's message as a scrolling marquee on
                the overlay, so text becomes load-bearing content (not optional).
                Server-side validation at /api/bookings/create-* also requires
                message ≠ null for banner slots and caps length. */}
            {slot.shape === 'banner' ? (
              <>
                <label className="bf-lbl">Your scrolling message · required</label>
                <textarea
                  value={message}
                  onChange={(e) => onMessageChange(e.target.value.slice(0, BANNER_MAX_MESSAGE))}
                  placeholder="What should scroll across the banner?"
                  rows={2}
                  maxLength={BANNER_MAX_MESSAGE}
                  className="bf-inp"
                  style={{ resize: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, color: message.length > BANNER_MAX_MESSAGE * 0.85 ? '#facc15' : '#555' }}>
                  <span>Shows as a live scroll on stream</span>
                  <span>{message.length}/{BANNER_MAX_MESSAGE}</span>
                </div>
                {message.trim().length > 0 && (
                  <div style={{ marginTop: 10, padding: 0, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(var(--casi-accent-rgb),0.25)' }}>
                    <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: '#555', padding: '6px 10px 0' }}>Preview</div>
                    <div className="beam-banner" style={{ height: 44, borderTop: 'none', borderBottom: 'none' }}>
                      <span className="beam-banner-track" style={{ fontSize: 20 }}>{message}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="bf-lbl">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => onMessageChange(e.target.value)}
                  placeholder="Anything for the streamer…"
                  rows={3}
                  className="bf-inp"
                  style={{ resize: 'none' }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* USDC cost preview (paid slots only) */}
      {!isFreeSlot && (
        <div style={{ background: 'rgba(153,69,255,0.05)', border: '1px solid rgba(153,69,255,0.2)', borderRadius: 10, padding: '12px 14px', margin: '12px 0', fontFamily: "var(--font-casi-mono),monospace", fontSize: 11 }}>
          {[['Duration', formatTime(durationSeconds)], ['Rate', `$${slot.price_value}/${slot.price_unit}`]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', color: '#555', marginBottom: 5 }}>
              <span>{l}</span><span>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1c1c1c', paddingTop: 8, marginTop: 4, fontSize: 13, fontWeight: 700, color: '#9945FF' }}>
            <span>Total</span><span>{estimatedCost} USDC</span>
          </div>
          {walletConnected && usdcBalance !== null ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#555' }}>
                <span>Your balance</span>
                <span style={{ color: usdcBalance < parseFloat(estimatedCost) ? '#f87171' : '#6ee7b7' }}>
                  {usdcBalance.toFixed(2)} USDC
                </span>
              </div>
              {usdcBalance < parseFloat(estimatedCost) && (
                <div style={{ color: '#f87171', fontSize: 10, marginTop: 5, textAlign: 'right' }}>⚠ Insufficient balance</div>
              )}
            </>
          ) : walletConnected ? (
            <div style={{ color: '#555', fontSize: 10, marginTop: 6 }}>Fetching balance…</div>
          ) : (
            <div style={{ color: '#555', fontSize: 10, marginTop: 6 }}>Connect wallet to pay with USDC on-chain</div>
          )}
        </div>
      )}

      {/* Queue wait estimate */}
      {queueWait && (
        <div style={{ background: `rgba(${tcRgb},0.06)`, border: `1px solid rgba(${tcRgb},0.15)`, borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 4 }}>Estimated wait</div>
          <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--casi-accent)' }}>~{queueWait.wait} min</div>
          <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: '#555', marginTop: 2 }}>
            {queueWait.ahead} booking{queueWait.ahead !== 1 ? 's' : ''} ahead of you
          </div>
        </div>
      )}

      {/* Free-slot Turnstile (paid slots skip it) */}
      {isFreeSlot && (
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <TurnstileWidget onVerify={onTurnstileVerify} onExpire={onTurnstileExpire} theme="dark" compact />
        </div>
      )}

      <div className="bf-footer">
        <div>
          <div className="bf-cost-lbl">{isFreeSlot ? 'Cost' : 'Estimated cost'}</div>
          <div className="bf-cost-val" style={{ color: isFreeSlot ? '#4ade80' : accentColor }}>
            {isFreeSlot ? 'Free' : `$${estimatedCost}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Stripe / Free */}
          <button
            onClick={onStripeSubmit}
            disabled={!canSubmit || submitting || freeBlocked}
            className="bf-sub"
            style={{ background: isFreeSlot ? '#4ade80' : accentColor, color: 'var(--casi-bg)', display: 'flex', alignItems: 'center', gap: 7, opacity: (!canSubmit || submitting || freeBlocked) ? 0.5 : 1 }}
          >
            {isFreeSlot ? (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.5 1l1.545 3.13L11.5 4.635 9 7.073l.59 3.442L6.5 8.89 3.41 10.515 4 7.073 1.5 4.635l3.455-.505L6.5 1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="14" height="11" viewBox="0 0 14 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0.5" y="0.5" width="13" height="10" rx="1.5" stroke="currentColor" strokeOpacity="0.6" />
                <rect x="0" y="3" width="14" height="2.5" fill="currentColor" fillOpacity="0.5" />
                <rect x="2" y="7" width="4" height="1.5" rx="0.5" fill="currentColor" />
              </svg>
            )}
            {submitting ? 'Sending…' : isExtend ? 'Extend' : isFreeSlot ? (isQueue ? 'Join Free Queue' : 'Send Free Request') : isQueue ? 'Join Queue' : 'Send Request'}
          </button>

          {/* Solana / CASI escrow (hidden for free slots) */}
          {!isFreeSlot && (
            <button
              disabled={connecting || submitting || (walletConnected && !canSubmit)}
              className="bf-sub"
              style={{ background: walletConnected ? '#9945FF' : 'rgba(153,69,255,0.12)', color: walletConnected ? '#fff' : '#9945FF', border: walletConnected ? 'none' : '1px solid rgba(153,69,255,0.35)', display: 'flex', alignItems: 'center', gap: 7, opacity: (connecting || submitting || (walletConnected && !canSubmit)) ? 0.5 : 1 }}
              onClick={onSolanaPay}
            >
              <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1.5 8.5h8.8c.15 0 .28.06.38.16l1.1 1.1c.14.14.04.37-.17.37H2.8c-.15 0-.28-.06-.38-.16L1.33 8.87c-.14-.14-.04-.37.17-.37ZM1.5 0h8.8c.15 0 .28.06.38.16l1.1 1.1c.14.14.04.37-.17.37H2.8c-.15 0-.28-.06-.38-.16L1.33.37C1.19.23 1.29 0 1.5 0ZM11.67 4.37 10.58 5.5H1.82c-.21 0-.31-.23-.17-.37l1.1-1.1c.1-.1.23-.16.38-.16h8.37c.21 0 .31.23.17.37Z" fill="currentColor" />
              </svg>
              {connecting ? 'Connecting…' : walletConnected ? 'Pay with SOL' : 'Connect & Pay SOL'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
