'use client';

import { useState } from 'react';

function fmtMaxDur(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
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
  /** SVG path data for a custom-shaped slot (shape === 'custom'). Lets the
   *  Customize position/zoom preview clip to the real shape instead of a
   *  circle stand-in — see CustomizePanel's clipPathSvg prop. */
  clip_path_svg?: string | null;
  /** Percent of the 16:9 stream canvas — the slot's real on-stream
   *  footprint. Needed so the crop/zoom preview box can match the
   *  actual aspect ratio instead of guessing from `shape` alone. */
  width?: number | string | null;
  height?: number | string | null;
};

type Booking = { id: string | number; element_id?: string | null; duration_minutes?: number | string | null };

type Props = {
  slot: Slot;
  accentColor: string;
  accentColorRgb: string;
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
    slot, accentColor, accentColorRgb,
    isExtend, isQueue, savedViewerName, onChangeNameClick, onClose,
    uploadMode, onUploadModeChange,
    uploadedUrl, uploadedFileType, uploading, onFileSelect, onRemoveUpload,
    imageUrl, imageValid, onImageUrlChange, onImageValidChange, getUrlFileType,
    durationSeconds, onDurationChange,
    message, onMessageChange,
    streamerCurrency, walletConnected, usdcBalance,
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

  // slot.width/height are percent-of-canvas on a 16:9 stream canvas, so the
  // slot's real on-stream aspect ratio is (width% * 16) / (height% * 9) —
  // NOT a fixed 16:9 or 1:1 guessed from `shape`. This matters for every
  // shape, including circle/custom: their clip-path is applied to whatever
  // box the streamer sized, so a non-square "circle" slot renders as an
  // ellipse on stream, not a true circle. Clamped to a sane display range
  // so a pathological slot config can't collapse the preview box to an
  // unusable sliver; real slots stay well inside this range.
  const w = Number(slot.width), h = Number(slot.height);
  const rawSlotAspectRatio = w > 0 && h > 0 ? (w * 16) / (h * 9) : 16 / 9;
  const slotAspectRatio = Math.min(6, Math.max(1 / 6, rawSlotAspectRatio));

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

  // Duration slider bounds. 30s floor matches the parent's own clamp
  // (see overlay/page.tsx's setDurationSecsClamped); 30min ceiling for
  // unbounded slots matches the old preset row's highest option.
  const sliderMin = 30;
  const sliderMax = maxSecs ?? 1800;
  const sliderRange = Math.max(1, sliderMax - sliderMin);
  const sliderMid = Math.round((sliderMin + sliderMax) / 2 / 5) * 5;
  const sliderPct = Math.min(100, Math.max(0, ((durationSeconds - sliderMin) / sliderRange) * 100));
  const tickLabel = (secs: number): string => (secs < 60 ? `${secs}s` : fmtMaxDur(Math.round(secs / 60)));

  const queueWait = (() => {
    if (!isQueue) return null;
    const active = activeBookings.find(b => b.element_id === slot.id);
    if (!active) return null;
    const activeRemaining = getSecondsRemaining(active);
    const queue = approvedQueuedBookings.filter(b => b.element_id === slot.id);
    const queueMinutes = queue.reduce((sum, b) => sum + Number(b.duration_minutes || 0), 0);
    // null = the current occupant has no time limit (streamer-published
    // content) -- there's no numeric estimate to give, not "0 min."
    if (activeRemaining === null) return { wait: null, ahead: queue.length };
    return { wait: Math.round(activeRemaining / 60 + queueMinutes), ahead: queue.length };
  })();

  return (
    <div className="bf">
      <div className="bf-hdr">
        <div>
          <div className="bf-type">
            {isExtend ? 'Extend slot' : isQueue ? 'Join queue' : 'Tip for slot'}
          </div>
          <div className="bf-price" style={{ color: isFreeSlot ? '#4ade80' : undefined }}>
            {isFreeSlot ? '★ Free' : formatSlotPrice(slot).label}
          </div>
        </div>
        <button className="bf-x" onClick={onClose}>✕</button>
      </div>

      <div className="bf-grid">
        <div className="bf-section">
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
                <div className="bf-hint" style={{ color: !imageUrl ? 'var(--ink-45)' : !imageUrl.startsWith('https://') ? '#f87171' : imageValid ? accentColor : '#f87171' }}>
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

          {/* Customize panel sits right under the media upload so the viewer
              gets immediate visual feedback after adding media — no scrolling
              required. auto-opens from page.tsx when media becomes ready. */}
          {slot.shape !== 'backdrop' && (
            <CustomizePanel
              shape={slot.shape}
              clipPathSvg={slot.clip_path_svg ?? null}
              slotAspectRatio={slotAspectRatio}
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
          )}

        <div className="bf-section">
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

        <div className="bf-section">
            {/* Slider, matching the design-source prototype's "How long"
                card exactly (track + fill + thumb + min/mid/max ticks)
                instead of a stepper + preset-pill row. The slider's own
                min/max ticks communicate the range, so the old "— max Xm"
                text callout is redundant here and was dropped. */}
            <div className="bf-dur-head">
              <div>
                <div className="bf-dur-label">How long</div>
                <div className="bf-dur-value">{formatTime(durationSeconds)}</div>
              </div>
              <div className="bf-dur-total">{costLabel(paymentRail)}</div>
            </div>
            <input
              type="range"
              className="bf-dur-slider"
              min={sliderMin}
              max={sliderMax}
              step={5}
              value={Math.min(sliderMax, Math.max(sliderMin, durationSeconds))}
              onChange={(e) => onDurationChange(Number(e.target.value))}
              style={{ background: `linear-gradient(to right, ${accentColor} ${sliderPct}%, var(--line-2) ${sliderPct}%)` }}
              aria-label="Duration"
            />
            <div className="bf-dur-ticks">
              <span>{tickLabel(sliderMin)}</span>
              <span>{tickLabel(sliderMid)}</span>
              <span>{tickLabel(sliderMax)}</span>
            </div>
        </div>

        <div className="bf-section">
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, color: message.length > BANNER_MAX_MESSAGE * 0.85 ? '#facc15' : 'var(--ink-45)' }}>
                  <span>Shows as a live scroll on stream</span>
                  <span>{message.length}/{BANNER_MAX_MESSAGE}</span>
                </div>
                {message.trim().length > 0 && (
                  <div style={{ marginTop: 10, padding: 0, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(var(--casi-accent-rgb),0.25)' }}>
                    <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ink-45)', padding: '6px 10px 0' }}>Preview</div>
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
          <div className="bf-section">
            <label className="bf-lbl">Payment</label>
            <div className="bf-rail-row" style={{ gridTemplateColumns: `repeat(${rails.length}, minmax(0, 1fr))` }}>
              {rails.map((r) => {
                const selected = paymentRail === r;
                const railAccent = r === 'free' ? '#4ade80' : r === 'usdc' ? 'var(--accent)' : accentColor;
                const disabled = isFreeSlot ? false : rails.length === 1; // sole rail isn't really a picker
                return (
                  <button
                    key={r}
                    type="button"
                    className="bf-rail-card"
                    onClick={() => !disabled && setPaymentRail(r)}
                    disabled={disabled}
                    style={{
                      background: selected ? `color-mix(in oklab, ${railAccent} 12%, var(--surf-2))` : undefined,
                      borderColor: selected ? railAccent : undefined,
                      cursor: disabled ? 'default' : 'pointer',
                    }}
                  >
                    <div className="bf-rail-top">
                      <span
                        aria-hidden
                        className="bf-rail-dot"
                        style={selected ? { borderColor: railAccent, background: railAccent } : undefined}
                      />
                      <span className="bf-rail-name" style={{ color: railAccent }}>
                        {railIcon(r)}
                        {railName(r)}
                      </span>
                    </div>
                    <div className="bf-rail-cost" style={selected ? { color: railAccent } : undefined}>
                      {costLabel(r)}
                    </div>
                    <div className="bf-rail-sub">{railSub(r)}</div>
                  </button>
                );
              })}
            </div>

            {/* Sub-detail line — duration + rate breakdown, in the same
                Newsreader-italic voice as the queue-wait aside below. */}
            <div className="bf-rail-meta">
              <span>{formatTime(durationSeconds)} · {slot.price_unit === 'hr' ? 'hourly rate' : 'per-minute rate'}</span>
              <span>{paymentRail === 'free' ? 'no charge' : paymentRail === 'stripe' ? `${fiatSymbol(streamerCurrency)}${fiatRate}/${slot.price_unit}` : `${usdcRate} USDC/${slot.price_unit}`}</span>
            </div>

            {/* USDC balance + insufficient warning — only when the USDC
                rail is the active one. No more showing USDC balance to
                a card-paying viewer. */}
            {paymentRail === 'usdc' && walletConnected && usdcBalance !== null ? (
              <div className="bf-rail-balance">
                <span>Your balance</span>
                <span style={{ color: usdcBalance < usdcCost ? '#f87171' : '#6ee7b7', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <UsdcIcon size={10} />
                  {usdcBalance.toFixed(2)} USDC
                </span>
              </div>
            ) : null}
            {paymentRail === 'usdc' && walletConnected && usdcBalance !== null && usdcBalance < usdcCost ? (
              <div className="bf-rail-note" style={{ color: '#f87171' }}>⚠ Insufficient balance</div>
            ) : null}
            {paymentRail === 'usdc' && walletConnected && usdcBalance === null ? (
              <div className="bf-rail-note">Fetching balance…</div>
            ) : null}
            {paymentRail === 'usdc' && !walletConnected ? (
              <div className="bf-rail-note">Connect wallet to pay with USDC on-chain</div>
            ) : null}

            {/* Queue wait estimate */}
            {queueWait && (
              <div className="bf-queue" style={{ marginTop: 14 }}>
                <div className="bf-queue-lbl">Estimated wait</div>
                <div className="bf-queue-val">
                  {queueWait.wait === null ? 'Unknown — waiting on streamer' : `~${queueWait.wait} min`}
                </div>
                <div className="bf-queue-sub">
                  {queueWait.ahead} booking{queueWait.ahead !== 1 ? 's' : ''} ahead of you
                </div>
              </div>
            )}

            {/* Free-slot Turnstile (paid slots skip it) */}
            {isFreeSlot && (
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <TurnstileWidget onVerify={onTurnstileVerify} onExpire={onTurnstileExpire} theme="dark" compact />
              </div>
            )}

            {/* Single pay button — the rail picker above already named the
                chosen rail + its cost, so the button is just the commit
                action. Color matches the selected rail so the visual link
                between picker and CTA is obvious. */}
            <div style={{ marginTop: 14 }}>
              {(() => {
                const railAccent =
                  paymentRail === 'free' ? '#4ade80'
                  : paymentRail === 'usdc' ? 'var(--accent)'
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
                      color: ghost ? railAccent : 'var(--casi-bg)',
                      border: ghost ? `1px solid ${railAccent}` : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      opacity: payButtonProps.disabled ? 0.5 : 1,
                    }}
                  >
                    {payButtonProps.icon === 'stripe' ? <StripeIcon size={12} mono="currentColor" />
                      : payButtonProps.icon === 'usdc' ? <UsdcIcon size={14} mono={ghost ? railAccent : 'var(--casi-bg)'} />
                      : <span style={{ fontSize: 14, lineHeight: 1 }}>★</span>}
                    <span>{isExtend ? 'Extend slot' : payButtonProps.label}</span>
                  </button>
                );
              })()}

              {/* Trust copy — small footnote below the button so first-time
                  viewers know what 'pay' commits them to. The streamer's
                  approval gate is the strongest reassurance and worth
                  surfacing. */}
              <div className="bf-trust">
                {paymentRail === 'free'
                  ? 'Free flashes are rate-limited · streamer can deny'
                  : paymentRail === 'usdc'
                    ? 'USDC held in escrow until streamer approves · 100% refund on deny'
                    : 'Authorized until streamer approves · 100% refund on deny · CASI 0%'}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
