'use client';

import Countdown from './Countdown';
import { getSecondsRemaining } from './time';

/**
 * One slot on the live stream canvas — the actual visible "beam" rectangle
 * (banner / image / empty / locked) plus its hover badges (price, status,
 * wait estimate, extend button). Extracted from a 200-line inline render
 * inside src/app/overlay/page.tsx so the page-level component is a state
 * coordinator + map, not a 2k-line render-and-handlers blob.
 *
 * Props are all read-only — every state mutation goes through the handlers
 * the page wires in (onSlotClick, onExtendClick, onCountdownExpire). Don't
 * add booking writes here; they belong on the page where the supabase
 * client + viewer auth tokens live.
 */

type Element = {
  id: string | number;
  shape?: string | null;
  is_background?: boolean | null;
  glow_on_start?: boolean | null;
  locked?: boolean | null;
  pos_x: number; pos_y: number; width: number; height: number;
  image_url?: string | null;
  price_value: number | string;
  price_unit: string;
  max_duration_minutes?: number | null;
};

// Loosely-typed booking row — matches whatever the page passes in. The
// real BOOKING_COLS list lives in src/app/overlay/page.tsx. We keep this
// permissive (extra fields allowed) so SlotTile doesn't have to be edited
// every time a column is added upstream.
type Booking = {
  id: string | number;
  status: string;
  message?: string | null;
  file_type?: 'image' | 'video' | null;
  started_at?: string | null;
  duration_minutes?: string | number | null;
  banner_font_px?: number | null;
  banner_speed_secs?: number | null;
  media_offset_x?: number | null;
  media_offset_y?: number | null;
  media_zoom?: number | null;
  [key: string]: unknown;
};

type ViewerPreview = {
  hasPreview: boolean;
  displayImage: string | null;
  displayFileType: 'image' | 'video' | null;
};

type ViewerCustomization = {
  bannerFontPx: number;
  bannerSpeedSecs: number;
  mediaOffsetX: number;
  mediaOffsetY: number;
  mediaZoom: number;
};

type Props = {
  el: Element;
  activeBooking: Booking | null;
  myBookingForSlot: Booking | null;
  queueCount: number;
  queueDurationMin: number;

  isOBS: boolean;
  isSelectedHere: boolean;
  showExtend: boolean;
  myIsExpiring: boolean;

  viewerPreview: ViewerPreview;
  viewerCustomization: ViewerCustomization;

  accentColor: string;
  accentColorRgb: string;
  tc: string;
  tcRgb: string;

  onSlotClick: (() => void) | undefined;
  onExtendClick: (() => void) | undefined;
  onCountdownExpire: (booking: Booking) => void;
};

export default function SlotTile({
  el, activeBooking, myBookingForSlot, queueCount, queueDurationMin,
  isOBS, isSelectedHere, showExtend, myIsExpiring,
  viewerPreview, viewerCustomization,
  accentColor, accentColorRgb, tc, tcRgb,
  onSlotClick, onExtendClick, onCountdownExpire,
}: Props) {
  const isOccupied = !!activeBooking;
  const isLocked   = !!el.locked;
  const isBannerActive = el.shape === 'banner' && isOccupied && !!activeBooking?.message;

  // Wait pill: remaining time on the live beam + sum of every queued
  // booking's duration. Clamp ≥1m so it never reads "0m wait" when there
  // is genuinely a live beam.
  const activeRemainingMin = activeBooking ? Math.max(0, getSecondsRemaining(activeBooking) / 60) : 0;
  const waitMin = Math.max(1, Math.round(activeRemainingMin + queueDurationMin));

  // Re-mount on each pending→active transition so .beam-glow plays fresh.
  const mediaKey = `${el.id}-${activeBooking?.id ?? 'none'}`;

  const shapeClass =
    el.shape === 'rounded' ? 'beam-shape-rounded' :
    el.shape === 'circle'  ? 'beam-shape-circle'  :
    el.shape === 'hex'     ? 'beam-shape-hex'     :
    '';
  const glowClass = isOccupied && (el.glow_on_start ?? true) && !el.is_background ? 'beam-glow' : '';

  // Per-booking customization: when staging a new booking on this slot,
  // mirror the form's live values so the on-canvas preview matches what
  // CustomizePanel shows. Otherwise read the active booking's stored
  // values, falling back to BANNER_*/MEDIA_*_RANGE.default.
  const cFontPx   = isSelectedHere ? viewerCustomization.bannerFontPx    : Number(activeBooking?.banner_font_px    ?? 28);
  const cSpeedSec = isSelectedHere ? viewerCustomization.bannerSpeedSecs : Number(activeBooking?.banner_speed_secs ?? 20);
  const cOffX     = isSelectedHere ? viewerCustomization.mediaOffsetX    : Number(activeBooking?.media_offset_x    ?? 50);
  const cOffY     = isSelectedHere ? viewerCustomization.mediaOffsetY    : Number(activeBooking?.media_offset_y    ?? 50);
  const cZoom     = isSelectedHere ? viewerCustomization.mediaZoom       : Number(activeBooking?.media_zoom        ?? 1);
  const hasCustomCrop = cOffX !== 50 || cOffY !== 50 || cZoom !== 1;
  // Circle/hex masks need cover (letterbox would leave wedges inside the
  // clip-path). Backdrops always cover. Other shapes stay contain unless
  // the viewer customized — that signals intentional cropping.
  const useCover = el.is_background || el.shape === 'circle' || el.shape === 'hex' || hasCustomCrop;
  const mediaInlineStyle: React.CSSProperties = {
    width: '100%', height: '100%',
    objectFit: useCover ? 'cover' : 'contain',
    objectPosition: `${cOffX}% ${cOffY}%`,
    transform: cZoom !== 1 ? `scale(${cZoom})` : undefined,
    pointerEvents: 'none',
  };

  const { displayImage, displayFileType, hasPreview } = viewerPreview;
  const previewOpacity = hasPreview && !isOBS ? 0.65 : 1;

  return (
    <div
      onClick={onSlotClick}
      style={{
        position: 'absolute',
        left: `${el.pos_x}%`, top: `${el.pos_y}%`,
        width: `${el.width}%`, height: `${el.height}%`,
        zIndex: el.is_background ? 10 : 50,
        cursor: onSlotClick ? 'pointer' : 'default',
        transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {isBannerActive ? (
        <div key={mediaKey} className={`beam-banner ${glowClass}`.trim()}>
          <span
            className="beam-banner-track"
            style={{ fontSize: cFontPx, animationDuration: `${cSpeedSec}s` }}
          >{activeBooking!.message}</span>
        </div>
      ) : displayImage ? (
        <div key={mediaKey} className={`${shapeClass} ${glowClass}`.trim()} style={{ position: 'relative', width: '100%', height: '100%' }}>
          {displayFileType === 'video'
            ? <video key={displayImage} src={displayImage} autoPlay loop muted playsInline style={{ ...mediaInlineStyle, opacity: previewOpacity }} />
            : <img   key={displayImage ?? 'empty'} src={displayImage} style={{ ...mediaInlineStyle, opacity: previewOpacity }} alt="" />
          }
          {hasPreview && !isOBS && <div style={{ position: 'absolute', inset: 0, borderRadius: 4, boxShadow: `inset 0 0 0 2px rgba(${accentColorRgb},0.5)`, pointerEvents: 'none' }} />}
        </div>
      ) : el.shape === 'banner' && !isOccupied && !isLocked && !isOBS ? (
        // Empty banner placeholder — viewer-side hint, NEVER rendered to
        // OBS (stream shouldn't show the placeholder permanently).
        <div className="beam-banner" style={{ opacity: 0.5, borderColor: `rgba(${tcRgb}, 0.3)` }}>
          <span className="beam-banner-track" style={{ color: `rgba(${tcRgb}, 0.7)` }}>
            ▰ Banner · your message scrolls here · tip to try
          </span>
        </div>
      ) : (
        <div className={shapeClass} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: el.is_background ? 12 : 6, border: `1.5px dashed ${isLocked ? 'rgba(248,113,113,0.3)' : isOccupied ? `rgba(${tcRgb},0.31)` : el.is_background ? 'rgba(168,85,247,0.3)' : `rgba(${tcRgb},0.25)`}`, background: isLocked ? 'rgba(248,113,113,0.03)' : isOccupied ? `rgba(${tcRgb},0.02)` : el.is_background ? 'rgba(168,85,247,0.03)' : `rgba(${tcRgb},0.02)` }}>
          <span style={{ fontSize: el.is_background ? 20 : 14, marginBottom: 4 }}>{isLocked ? '🔒' : isOccupied ? (el.shape === 'banner' ? '▰' : '') : el.is_background ? '🖼' : el.shape === 'banner' ? '▰' : '✦'}</span>
          {isOccupied && activeBooking && (
            <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: `rgba(${tcRgb},0.69)` }}>
              <Countdown booking={activeBooking} onExpire={() => onCountdownExpire(activeBooking)} />
            </span>
          )}
        </div>
      )}

      {isSelectedHere && !isOBS && (
        <div style={{ position: 'absolute', inset: -3, borderRadius: 10, border: `2px solid ${accentColor}`, boxShadow: `0 0 0 4px rgba(${accentColorRgb},0.15)`, pointerEvents: 'none', zIndex: 15 }} />
      )}

      {/* Price badge */}
      {Number(el.price_value) >= 0 && !isOBS && (
        <div
          style={{
            position: 'absolute',
            ...(el.is_background
              ? { bottom: 12, left: '50%', transform: 'translateX(-50%)' }
              : { top: 6, right: 6 }),
            background: 'rgba(5,5,5,0.92)',
            border: `1px solid ${Number(el.price_value) === 0 ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 20,
            padding: '3px 10px',
            pointerEvents: 'none',
            zIndex: 20,
            fontFamily: 'var(--font-casi-mono),monospace',
            fontSize: 10,
            color: Number(el.price_value) === 0 ? '#4ade80' : tc,
            whiteSpace: 'nowrap',
          }}
        >
          {Number(el.price_value) === 0 ? '★ Free' : `$${el.price_value}/${el.price_unit}`}
          {el.max_duration_minutes && <span style={{ color: '#555', marginLeft: 6, fontSize: 9 }}>· max {el.max_duration_minutes}m</span>}
        </div>
      )}

      {/* Status badge */}
      {!isOBS && (isLocked || myBookingForSlot) && (
        <div
          style={{
            position: 'absolute', top: 6, left: 6,
            zIndex: 20, pointerEvents: 'none',
            fontFamily: 'var(--font-casi-mono),monospace', fontSize: 9,
            padding: '3px 10px', borderRadius: 20, border: '1px solid',
            ...(isLocked
              ? { color: 'rgba(248,113,113,0.6)', borderColor: 'rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)' }
              : myIsExpiring
                ? { color: '#facc15', borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.08)' }
                : myBookingForSlot!.status === 'active'
                  ? { color: tc, borderColor: `rgba(${tcRgb},0.3)`, background: `rgba(${tcRgb},0.08)` }
                  : myBookingForSlot!.status === 'approved_queued'
                    ? { color: tc, borderColor: `rgba(${tcRgb},0.22)`, background: `rgba(${tcRgb},0.05)` }
                    : { color: 'var(--casi-text-muted)', borderColor: 'var(--casi-border)', background: 'rgba(255,255,255,0.03)' }
            ),
          }}
        >
          {isLocked
            ? '🔒 Locked'
            : myIsExpiring
              ? '⚠ Expiring'
              : myBookingForSlot!.status === 'active'
                ? '● Your beam'
                : myBookingForSlot!.status === 'approved_queued'
                  ? '⏳ Queued'
                  : '⌛ Pending'}
        </div>
      )}

      {/* Wait estimate */}
      {!isOBS && isOccupied && !myBookingForSlot && !isLocked && (
        <div
          style={{
            position: 'absolute', bottom: 6, right: 6,
            zIndex: 20, pointerEvents: 'none',
            fontFamily: 'var(--font-casi-mono),monospace', fontSize: 9,
            color: `rgba(${tcRgb},0.8)`,
            background: 'rgba(5,5,5,0.85)',
            border: `1px solid rgba(${tcRgb},0.22)`,
            borderRadius: 20, padding: '2px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          ⏳ {queueCount > 0 ? `${queueCount} queued · ` : ''}~{waitMin}m wait
        </div>
      )}

      {/* Extend — separate button so it doesn't collapse into the slot
          click (which re-opens the booking form in book-new mode). */}
      {!isOBS && showExtend && onExtendClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onExtendClick(); }}
          style={{
            position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
            background: '#eab308', border: 'none', borderRadius: 20,
            padding: '4px 14px', fontFamily: 'var(--font-casi-sans),sans-serif',
            fontWeight: 700, fontSize: 10, textTransform: 'uppercase',
            color: 'var(--casi-bg)', cursor: 'pointer', zIndex: 25,
          }}
        >
          Extend
        </button>
      )}
    </div>
  );
}
