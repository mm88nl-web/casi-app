'use client';

import { useState } from 'react';
import { BANNER_MAX_MESSAGE } from '@/lib/banner';
import TurnstileWidget from '@/components/TurnstileWidget';
import UsdcIcon from '@/components/icons/UsdcIcon';
import StripeIcon from '@/components/icons/StripeIcon';
import { formatSlotPrice } from '@/lib/slot-pricing';
import { fiatSymbol } from '@/lib/currency';
import CustomizePanel from './CustomizePanel';
import { formatTime, getSecondsRemaining } from './time';

type Slot = {
  id: string | number;
  price_value: number | string;
  price_unit: string;
  /** Per-rail JSONB. formatSlotPrice picks USDC / EUR / USD from here in
   *  preference order; falls back to price_value for legacy slots. */
  prices?: Record<string, number | string | null | undefined> | null;
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
  minDurationSeconds: number;

  // Message
  message: string;
  onMessageChange: (m: string) => void;

  // Cost / wallet
  estimatedCost: string;
  /** Streamer's Stripe Connect settlement currency (lowercase ISO-4217).
   *  Drives the fiat symbol on the estimated-cost footer. null means
   *  Stripe isn't connected — the footer falls back to '$'. */
  streamerCurrency?: string | null;
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
    durationSeconds, onDurationChange, minDurationSeconds,
    message, onMessageChange,
    estimatedCost, streamerCurrency, walletConnected, usdcBalance,
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

  // Per-rail availability + cost. The slot's prices JSONB holds rates
  // keyed by ISO code (gbp / eur / jpy / etc — set by BeamCtrlPanel based
  // on the streamer's Stripe Connect default_currency) and one usdc key.
  // We compute both costs locally so the rail picker can surface them
  // side by side and the pay button can label itself with the right
  // amount, instead of the prior approach where the parent passed one
  // pre-formatted estimatedCost that didn't match what each rail would
  // actually charge.
  type Rail = 'stripe' | 'usdc' | 'free';
  const fiatCode = (streamerCurrency || 'usd').toLowerCase();
  const fiatRate = Number(slot.prices?.[fiatCode] ?? slot.price_value ?? 0) || 0;
  const usdcRate = Number(slot.prices?.usdc ?? 0) || 0;
  const stripeAvailable = !isFreeSlot && fiatRate > 0;
  const usdcAvailable = !isFreeSlot && usdcRate > 0;
  const secsPerUnit = slot.price_unit === 'hr' ? 3600 : 60;
  const stripeCost = stripeAvailable ? (fiatRate * durationSeconds) / secsPerUnit : 0;
  const usdcCost = usdcAvailable ? (usdcRate * durationSeconds) / secsPerUnit : 0;

  // Default rail: free slots = free; paid slots prefer stripe when both
  // rails are priced (matches viewer expectation that "card" is the
  // default payment method on the modern web); USDC-only slots auto-pick
  // usdc. The state stays internal to the form — parent doesn't need to
  // know which rail the viewer picked, only which submit callback to
  // run (onStripeSubmit vs onSolanaPay) when the pay button is clicked.
  const defaultRail: Rail = isFreeSlot
    ? 'free'
    : stripeAvailable
      ? 'stripe'
      : 'usdc';
  const [paymentRail, setPaymentRail] = useState<Rail>(defaultRail);

  // Format the cost string for a given rail. Used on rail-picker cards
  // AND on the pay button, so the two stay in sync without a separate
  // memo or prop drill.
  const costLabel = (rail: Rail): string => {
    if (rail === 'free') return 'Free';
    if (rail === 'stripe') return `${fiatSymbol(streamerCurrency)}${stripeCost.toFixed(2)}`;
    return `${usdcCost.toFixed(2)} USDC`;
  };

  // What the pay button says + which submit callback it runs.
  const payButtonProps = (() => {
    if (paymentRail === 'free') {
      return {
        label: submitting ? 'Sending…' : (isQueue ? 'Join free queue' : 'Send free request'),
        onClick: onStripeSubmit, // free + stripe share the request handler
        disabled: !canSubmit || submitting || freeBlocked,
        icon: 'free' as const,
      };
    }
    if (paymentRail === 'stripe') {
      return {
        label: submitting ? 'Sending…' : `Pay ${costLabel('stripe')}`,
        onClick: onStripeSubmit,
        disabled: !canSubmit || submitting,
        icon: 'stripe' as const,
      };
    }
    return {
      label: connecting
        ? 'Connecting…'
        : !walletConnected
          ? `Connect wallet · ${costLabel('usdc')}`
          : submitting
            ? 'Sending…'
            : `Pay ${costLabel('usdc')}`,
      onClick: onSolanaPay,
      disabled: connecting || submitting || (walletConnected && !canSubmit),
      icon: 'usdc' as const,
    };
  })();

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
            {isFreeSlot ? '★ Free' : formatSlotPrice(slot).label}
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
            {minDurationSeconds > 0 && durationSeconds < minDurationSeconds && (
              <p style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, color: '#f87171', letterSpacing: '0.08em', marginTop: 6 }}>
                Min {Math.ceil(minDurationSeconds / 60)} min required
              </p>
            )}
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

      {/* Rail picker + cost summary. Replaces the prior USDC-only preview
          box, which only spoke to one of the three rails and silently
          assumed the viewer wanted USDC. Now: one block shows BOTH rails
          (when both are priced), the selected rail gets the accent
          border + filled radio, and the cost on each card is what THAT
          rail will charge — not a shared number translated between
          currencies. Free slots collapse this to a single inert card. */}
      {(() => {
        const rails: Rail[] = isFreeSlot
          ? ['free']
          : [
              ...(stripeAvailable ? ['stripe' as const] : []),
              ...(usdcAvailable ? ['usdc' as const] : []),
            ];
        const railName = (r: Rail) => (r === 'free' ? 'Free' : r === 'stripe' ? 'Card' : 'USDC');
        const railSub = (r: Rail) =>
          r === 'free' ? 'rate-limited' : r === 'stripe' ? 'via Stripe' : 'on-chain · Solana';
        const railIcon = (r: Rail) =>
          r === 'free' ? (
            <span style={{ fontSize: 13, lineHeight: 1 }}>★</span>
          ) : r === 'stripe' ? (
            <StripeIcon size={12} mono="currentColor" />
          ) : (
            <UsdcIcon size={14} />
          );

        return (
          <div className="bf-rail" style={{ margin: '14px 0 12px' }}>
            <div className="bf-rail-row" style={{ display: 'grid', gridTemplateColumns: `repeat(${rails.length}, minmax(0, 1fr))`, gap: 8 }}>
              {rails.map((r) => {
                const selected = paymentRail === r;
                const railAccent = r === 'free' ? '#4ade80' : r === 'usdc' ? '#9945FF' : accentColor;
                const disabled = isFreeSlot ? false : rails.length === 1; // sole rail isn't really a picker
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => !disabled && setPaymentRail(r)}
                    disabled={disabled}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 6,
                      padding: '12px 14px',
                      background: selected ? `color-mix(in oklab, ${railAccent} 12%, transparent)` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selected ? railAccent : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 10,
                      cursor: disabled ? 'default' : 'pointer',
                      color: 'var(--casi-text)',
                      textAlign: 'left',
                      fontFamily: "var(--B), var(--font-casi-sans), sans-serif",
                      transition: 'border-color 0.14s, background 0.14s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                      <span
                        aria-hidden
                        style={{
                          width: 14, height: 14, borderRadius: '50%',
                          border: `1.5px solid ${selected ? railAccent : 'rgba(255,255,255,0.25)'}`,
                          background: selected ? railAccent : 'transparent',
                          flexShrink: 0,
                          display: 'inline-block',
                          boxShadow: selected ? `inset 0 0 0 2px var(--casi-bg, #0c0d11)` : 'none',
                        }}
                      />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: railAccent, fontFamily: "var(--M), var(--font-casi-mono), monospace", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
                        {railIcon(r)}
                        {railName(r)}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 18, fontWeight: 700, color: selected ? railAccent : 'var(--casi-text)', letterSpacing: 0.5, marginTop: 2 }}>
                      {costLabel(r)}
                    </div>
                    <div style={{ fontFamily: "var(--M), var(--font-casi-mono),monospace", fontSize: 9, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                      {railSub(r)}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sub-detail line — duration + rate breakdown, neutralized
                visually so it doesn't compete with the rail cards above. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '0 4px', fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, color: '#666', letterSpacing: 0.5 }}>
              <span>{formatTime(durationSeconds)} · {slot.price_unit === 'hr' ? 'hourly rate' : 'per-minute rate'}</span>
              <span>{paymentRail === 'free' ? 'no charge' : paymentRail === 'stripe' ? `${fiatSymbol(streamerCurrency)}${fiatRate}/${slot.price_unit}` : `${usdcRate} USDC/${slot.price_unit}`}</span>
            </div>

            {/* USDC balance + insufficient warning — only when the USDC
                rail is the active one. No more showing USDC balance to
                a card-paying viewer. */}
            {paymentRail === 'usdc' && walletConnected && usdcBalance !== null ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 4px', fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, letterSpacing: 0.5 }}>
                <span style={{ color: '#666' }}>Your balance</span>
                <span style={{ color: usdcBalance < usdcCost ? '#f87171' : '#6ee7b7', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <UsdcIcon size={10} />
                  {usdcBalance.toFixed(2)} USDC
                </span>
              </div>
            ) : null}
            {paymentRail === 'usdc' && walletConnected && usdcBalance !== null && usdcBalance < usdcCost ? (
              <div style={{ color: '#f87171', fontSize: 10, marginTop: 5, textAlign: 'right' }}>⚠ Insufficient balance</div>
            ) : null}
            {paymentRail === 'usdc' && walletConnected && usdcBalance === null ? (
              <div style={{ color: '#555', fontSize: 10, marginTop: 6, textAlign: 'right' }}>Fetching balance…</div>
            ) : null}
            {paymentRail === 'usdc' && !walletConnected ? (
              <div style={{ color: '#555', fontSize: 10, marginTop: 6, textAlign: 'right' }}>Connect wallet to pay with USDC on-chain</div>
            ) : null}
          </div>
        );
      })()}

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

      {/* Single pay button — the rail picker above already named the
          chosen rail + its cost, so the button is just the commit
          action. Color matches the selected rail so the visual link
          between picker and CTA is obvious. */}
      <div style={{ marginTop: 4 }}>
        {(() => {
          const railAccent =
            paymentRail === 'free' ? '#4ade80'
            : paymentRail === 'usdc' ? '#9945FF'
            : accentColor;
          // For USDC rail with unconnected wallet, fall to ghost style so
          // the action reads as 'connect first' rather than 'commit now'.
          const ghost = paymentRail === 'usdc' && !walletConnected;
          return (
            <button
              onClick={payButtonProps.onClick}
              disabled={payButtonProps.disabled}
              className="bf-sub"
              style={{
                width: '100%',
                background: ghost ? 'transparent' : railAccent,
                color: ghost ? railAccent : (paymentRail === 'usdc' ? '#fff' : 'var(--casi-bg)'),
                border: ghost ? `1px solid ${railAccent}` : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 18px',
                fontFamily: "var(--font-casi-sans), sans-serif",
                fontWeight: 800,
                fontSize: 14,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                opacity: payButtonProps.disabled ? 0.5 : 1,
                cursor: payButtonProps.disabled ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.16s',
              }}
            >
              {payButtonProps.icon === 'stripe' ? <StripeIcon size={12} mono="currentColor" />
                : payButtonProps.icon === 'usdc' ? <UsdcIcon size={14} mono={ghost ? railAccent : '#fff'} />
                : <span style={{ fontSize: 14, lineHeight: 1 }}>★</span>}
              <span>{isExtend ? 'Extend slot' : payButtonProps.label}</span>
            </button>
          );
        })()}

        {/* Trust copy — small footnote below the button so first-time
            viewers know what 'pay' commits them to. The streamer's
            approval gate is the strongest reassurance and worth
            surfacing. */}
        <div style={{ marginTop: 10, fontFamily: "var(--M), var(--font-casi-mono), monospace", fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#555', textAlign: 'center' }}>
          {paymentRail === 'free'
            ? 'Free flashes are rate-limited · streamer can deny'
            : paymentRail === 'usdc'
              ? 'USDC held in escrow until streamer approves · 100% refund on deny'
              : 'Authorized until streamer approves · 100% refund on deny · CASI 0%'}
        </div>
      </div>
    </div>
  );
}
