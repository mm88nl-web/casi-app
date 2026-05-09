'use client';

import { BANNER_MAX_MESSAGE } from '@/lib/banner';
import TurnstileWidget from '@/components/TurnstileWidget';
import UsdcIcon from '@/components/icons/UsdcIcon';
import StripeIcon from '@/components/icons/StripeIcon';
import CustomizePanel from './CustomizePanel';
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

  // Customize (banner font/speed + media offset/zoom)
  customizeOpen: boolean;
  onCustomizeToggle: () => void;
  bannerFontPx: number;
  onBannerFontPxChange: (n: number) => void;
  bannerSpeedSecs: number;
  onBannerSpeedSecsChange: (n: number) => void;
  mediaOffsetX: number;
  mediaOffsetY: number;
  onMediaOffsetChange: (x: number, y: number) => void;
  mediaZoom: number;
  onMediaZoomChange: (n: number) => void;

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
    customizeOpen, onCustomizeToggle,
    bannerFontPx, onBannerFontPxChange,
    bannerSpeedSecs, onBannerSpeedSecsChange,
    mediaOffsetX, mediaOffsetY, onMediaOffsetChange,
    mediaZoom, onMediaZoomChange,
    canSubmit, submitting, connecting, onStripeSubmit, onSolanaPay,
  } = props;

  // The customize panel re-uses whatever the viewer has staged in the
  // upload / URL inputs above so they see exactly what the streamer
  // will get on stream.
  const customizePreviewUrl: string | null =
    uploadMode === 'upload' ? uploadedUrl : (imageValid && imageUrl ? imageUrl : null);
  const customizePreviewFileType: 'image' | 'video' | null =
    uploadMode === 'upload' ? uploadedFileType : (imageUrl ? getUrlFileType(imageUrl) : null);

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
            <div className="casi-v9-media-tabs">
              {(['upload', 'url'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onUploadModeChange(m)}
                  className={`casi-v9-media-tab${uploadMode === m ? ' casi-v9-on' : ''}`}
                >
                  {m === 'upload' ? (
                    <>
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M12 4v12" />
                        <path d="M7 9l5-5 5 5" />
                        <path d="M5 20h14" />
                      </svg>
                      <span>Upload</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
                        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                      </svg>
                      <span>Link</span>
                    </>
                  )}
                </button>
              ))}
            </div>

            {uploadMode === 'upload' ? (
              <div>
                <label
                  className={`casi-v9-upload-zone${uploadedUrl ? ' casi-v9-loaded' : ''}`}
                  style={{ cursor: uploading ? 'wait' : 'pointer' }}
                >
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFileSelect(f);
                    }}
                  />
                  {!uploadedUrl && !uploading && <span className="casi-v9-upload-ico" aria-hidden />}
                  <span className="casi-v9-upload-hint">
                    {uploading
                      ? 'Uploading…'
                      : uploadedUrl
                      ? `✓ ${uploadedFileType === 'video' ? 'Video' : 'Image'} ready`
                      : 'Drop your beam · or click to browse'}
                    {!uploadedUrl && !uploading && (
                      <em>Img or video · 20 MB · 1080p max</em>
                    )}
                  </span>
                  {!uploadedUrl && !uploading && (
                    <div className="casi-v9-upload-formats">
                      <span className="casi-v9-upload-fmt">JPG</span>
                      <span className="casi-v9-upload-fmt">PNG</span>
                      <span className="casi-v9-upload-fmt">GIF</span>
                      <span className="casi-v9-upload-fmt">MP4</span>
                      <span className="casi-v9-upload-fmt">WEBM</span>
                    </div>
                  )}
                </label>
                {uploadedUrl && (
                  <button
                    onClick={onRemoveUpload}
                    style={{ background: 'none', border: 'none', fontFamily: 'var(--M)', fontSize: 10, color: '#f87171', cursor: 'pointer', marginTop: 6, letterSpacing: '0.12em', textTransform: 'uppercase' }}
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
            <div className="casi-v9-viewing-as">
              <span className="casi-v9-va-avatar" aria-hidden />
              <div className="casi-v9-va-info">
                <span className="casi-v9-va-name">@{savedViewerName}</span>
                <span className="casi-v9-va-tag">Local session</span>
              </div>
              <button
                type="button"
                onClick={onChangeNameClick}
                className="casi-v9-va-change"
              >
                Change
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

      <CustomizePanel
        shape={slot.shape}
        open={customizeOpen}
        onToggle={onCustomizeToggle}
        accentColor={accentColor}
        accentColorRgb={accentColorRgb}
        message={message}
        bannerFontPx={bannerFontPx}
        onBannerFontPxChange={onBannerFontPxChange}
        bannerSpeedSecs={bannerSpeedSecs}
        onBannerSpeedSecsChange={onBannerSpeedSecsChange}
        mediaPreviewUrl={customizePreviewUrl}
        mediaPreviewFileType={customizePreviewFileType}
        mediaOffsetX={mediaOffsetX}
        mediaOffsetY={mediaOffsetY}
        onMediaOffsetChange={onMediaOffsetChange}
        mediaZoom={mediaZoom}
        onMediaZoomChange={onMediaZoomChange}
      />

      {/* USDC cost preview (paid slots only) */}
      {!isFreeSlot && (
        <div style={{ background: 'rgba(153,69,255,0.05)', border: '1px solid rgba(153,69,255,0.2)', borderRadius: 10, padding: '12px 14px', margin: '12px 0', fontFamily: "var(--font-casi-mono),monospace", fontSize: 11 }}>
          {[['Duration', formatTime(durationSeconds)], ['Rate', `$${slot.price_value}/${slot.price_unit}`]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', color: '#555', marginBottom: 5 }}>
              <span>{l}</span><span>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1c1c1c', paddingTop: 8, marginTop: 4, fontSize: 13, fontWeight: 700, color: '#9945FF' }}>
            <span>Total</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <UsdcIcon size={12} />
              {estimatedCost} USDC
            </span>
          </div>
          {walletConnected && usdcBalance !== null ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#555' }}>
                <span>Your balance</span>
                <span style={{ color: usdcBalance < parseFloat(estimatedCost) ? '#f87171' : '#6ee7b7', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <UsdcIcon size={10} />
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
              <StripeIcon size={11} mono="currentColor" />
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
              <UsdcIcon size={12} mono={walletConnected ? '#fff' : '#9945FF'} />
              {connecting ? 'Connecting…' : walletConnected ? 'Pay with USDC' : 'Connect & Pay USDC'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
