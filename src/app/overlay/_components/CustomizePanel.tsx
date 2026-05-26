'use client';

import { useEffect, useRef } from 'react';
import {
  BANNER_FONT_PX_RANGE,
  BANNER_SPEED_SECS_RANGE,
  MEDIA_OFFSET_RANGE,
  MEDIA_ZOOM_RANGE,
} from '@/lib/banner';

type Props = {
  shape: string | null | undefined;
  open: boolean;
  onToggle: () => void;
  accentColor: string;
  accentColorRgb: string;

  // Banner
  message: string;
  bannerFontPx: number;
  onBannerFontPxChange: (n: number) => void;
  bannerSpeedSecs: number;
  onBannerSpeedSecsChange: (n: number) => void;

  // Media (shape-able beam)
  mediaPreviewUrl: string | null;
  mediaPreviewFileType: 'image' | 'video' | null;
  mediaOffsetX: number;
  mediaOffsetY: number;
  onMediaOffsetChange: (x: number, y: number) => void;
  mediaZoom: number;
  onMediaZoomChange: (n: number) => void;
};

const SHAPE_CSS: Record<string, string> = {
  rect:    'none',
  rounded: 'inset(0 round 14px)',
  circle:  'circle(50%)',
  hex:     'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
};

const FONT_PRESETS = [
  { label: 'S', px: 18 },
  { label: 'M', px: 28 },
  { label: 'L', px: 48 },
  { label: 'XL', px: 72 },
] as const;

const SPEED_PRESETS = [
  { label: 'Slow',   secs: 40 },
  { label: 'Normal', secs: 20 },
  { label: 'Fast',   secs: 8  },
] as const;

export default function CustomizePanel({
  shape, open, onToggle,
  accentColor, accentColorRgb,
  message, bannerFontPx, onBannerFontPxChange, bannerSpeedSecs, onBannerSpeedSecsChange,
  mediaPreviewUrl, mediaPreviewFileType,
  mediaOffsetX, mediaOffsetY, onMediaOffsetChange,
  mediaZoom, onMediaZoomChange,
}: Props) {
  const isBanner = shape === 'banner';
  const isShapedMedia = shape === 'rect' || shape === 'rounded' || shape === 'circle' || shape === 'hex' || shape === 'custom' || shape == null;

  // Backdrop slots cover the full canvas — there's nothing to pan/zoom
  // and no banner text. Hide the panel entirely so we don't surface
  // controls that would confuse rather than help.
  if (shape === 'backdrop') return null;

  const dragRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

  // Stable refs so the wheel/touch handlers never go stale.
  const mediaZoomRef = useRef(mediaZoom);
  const onMediaZoomChangeRef = useRef(onMediaZoomChange);
  mediaZoomRef.current = mediaZoom;
  onMediaZoomChangeRef.current = onMediaZoomChange;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mediaPreviewUrl) return;
    dragRef.current?.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX, startY: e.clientY,
      startOffX: mediaOffsetX, startOffY: mediaOffsetY,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    const box = dragRef.current?.getBoundingClientRect();
    if (!s || !box) return;
    // Convert pixel delta to percent of the preview frame, inverted because
    // dragging the image RIGHT visually moves the visible region LEFT (the
    // object-position percent shifts toward the left edge of the source).
    const dxPct = ((e.clientX - s.startX) / box.width)  * 100;
    const dyPct = ((e.clientY - s.startY) / box.height) * 100;
    const nextX = Math.min(100, Math.max(0, s.startOffX - dxPct));
    const nextY = Math.min(100, Math.max(0, s.startOffY - dyPct));
    onMediaOffsetChange(nextX, nextY);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current?.releasePointerCapture(e.pointerId);
    dragState.current = null;
  };

  // Attach non-passive wheel + touch listeners for scroll/pinch-to-zoom.
  // Must be done imperatively so we can pass { passive: false } — React's
  // synthetic event system always registers passive listeners for wheel/touch.
  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.0015;
      const next = Math.min(MEDIA_ZOOM_RANGE.max, Math.max(MEDIA_ZOOM_RANGE.min, mediaZoomRef.current + delta));
      onMediaZoomChangeRef.current(next);
    };

    let lastDist: number | null = null;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastDist = Math.hypot(dx, dy);
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastDist === null) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / lastDist;
      lastDist = dist;
      const next = Math.min(MEDIA_ZOOM_RANGE.max, Math.max(MEDIA_ZOOM_RANGE.min, mediaZoomRef.current * scale));
      onMediaZoomChangeRef.current(next);
    };
    const handleTouchEnd = () => { lastDist = null; };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [open]); // re-attach when panel opens (dragRef.current is null while closed)

  const fontDef   = BANNER_FONT_PX_RANGE.default;
  const speedDef  = BANNER_SPEED_SECS_RANGE.default;
  const offsetDef = MEDIA_OFFSET_RANGE.default;
  const zoomDef   = MEDIA_ZOOM_RANGE.default;
  const resetBanner = () => { onBannerFontPxChange(fontDef); onBannerSpeedSecsChange(speedDef); };

  const previewMaskCss = SHAPE_CSS[shape ?? 'rect'] ?? 'none';

  // Mirror the stream's objectFit logic: contain by default so the whole image
  // is visible; switch to cover once the user has started panning / zooming.
  const hasCustomCrop = mediaOffsetX !== offsetDef || mediaOffsetY !== offsetDef || mediaZoom !== zoomDef;
  const previewObjectFit: 'cover' | 'contain' =
    (shape === 'circle' || shape === 'hex' || hasCustomCrop) ? 'cover' : 'contain';

  // Shared segment-button style factory.
  const segBtn = (active: boolean, isLast: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '5px 0',
    fontFamily: 'var(--font-casi-mono),monospace',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    border: `1px solid ${active ? accentColor : 'rgba(255,255,255,0.12)'}`,
    borderRight: isLast ? `1px solid ${active ? accentColor : 'rgba(255,255,255,0.12)'}` : 'none',
    borderRadius: 0,
    background: active ? accentColor : 'transparent',
    color: active ? 'var(--casi-bg)' : '#888',
    transition: 'background 0.12s, color 0.12s',
  });

  return (
    <div style={{ marginTop: 14, border: `1px solid rgba(${accentColorRgb},0.13)`, borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '10px 14px',
          fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, letterSpacing: 2,
          textTransform: 'uppercase', color: 'var(--casi-text-muted)',
        }}
      >
        <span>{open ? '▾' : '▸'} Customize</span>
        <span style={{ color: '#444' }}>{isBanner ? 'size · speed' : 'drag · scroll to zoom'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isBanner && (
            <>
              {/* Font size preset buttons */}
              <div>
                <label className="bf-lbl" style={{ marginBottom: 6, display: 'block' }}>Size</label>
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
                  {FONT_PRESETS.map((p, i) => (
                    <button
                      key={p.px}
                      onClick={() => onBannerFontPxChange(p.px)}
                      style={segBtn(bannerFontPx === p.px, i === FONT_PRESETS.length - 1)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scroll speed preset buttons */}
              <div>
                <label className="bf-lbl" style={{ marginBottom: 6, display: 'block' }}>Speed</label>
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
                  {SPEED_PRESETS.map((p, i) => (
                    <button
                      key={p.secs}
                      onClick={() => onBannerSpeedSecsChange(p.secs)}
                      style={segBtn(bannerSpeedSecs === p.secs, i === SPEED_PRESETS.length - 1)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-casi-mono),monospace', fontSize: 9, color: '#444', marginTop: 3 }}>
                  <span>Slow</span><span>Fast</span>
                </div>
              </div>

              {/* Live banner preview */}
              <div style={{ borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(var(--casi-accent-rgb),0.25)' }}>
                <div style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: '#555', padding: '6px 10px 0' }}>Preview</div>
                <div className="beam-banner" style={{ height: Math.max(44, bannerFontPx + 16), borderTop: 'none', borderBottom: 'none' }}>
                  <span
                    className="beam-banner-track"
                    style={{ fontSize: bannerFontPx, animationDuration: `${bannerSpeedSecs}s` }}
                  >
                    {message || '✦ Your message scrolls here'}
                  </span>
                </div>
              </div>

              <button onClick={resetBanner} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', fontFamily: 'var(--font-casi-mono),monospace', fontSize: 9, color: '#555', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
                ↺ Reset defaults
              </button>
            </>
          )}

          {!isBanner && isShapedMedia && (
            <>
              <div>
                <label className="bf-lbl" style={{ marginBottom: 6, display: 'block' }}>
                  Position {mediaPreviewUrl ? '· drag to pan · scroll to zoom' : ''}
                </label>
                <div
                  ref={dragRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  style={{
                    width: '100%',
                    aspectRatio: shape === 'circle' || shape === 'hex' ? '1 / 1' : '16 / 9',
                    maxHeight: 200,
                    background: '#0d0d0d',
                    border: `1px solid rgba(${accentColorRgb},0.2)`,
                    borderRadius: 8,
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: mediaPreviewUrl ? 'grab' : 'default',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                >
                  {mediaPreviewUrl ? (
                    <div style={{ position: 'absolute', inset: 0, clipPath: previewMaskCss === 'none' ? undefined : previewMaskCss }}>
                      {mediaPreviewFileType === 'video' ? (
                        <video
                          src={mediaPreviewUrl}
                          autoPlay muted loop playsInline
                          style={{ width: '100%', height: '100%', objectFit: previewObjectFit, objectPosition: `${mediaOffsetX}% ${mediaOffsetY}%`, transform: `scale(${mediaZoom})`, pointerEvents: 'none' }}
                        />
                      ) : (
                        <img
                          src={mediaPreviewUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: previewObjectFit, objectPosition: `${mediaOffsetX}% ${mediaOffsetY}%`, transform: `scale(${mediaZoom})`, pointerEvents: 'none' }}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, letterSpacing: 1 }}>
                      Upload media to position it
                    </div>
                  )}

                  {/* Zoom pill — bottom-right. Click to reset zoom + position. */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMediaZoomChange(zoomDef);
                      onMediaOffsetChange(offsetDef, offsetDef);
                    }}
                    title="Reset zoom and position"
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      background: 'rgba(0,0,0,0.55)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontFamily: 'var(--font-casi-mono),monospace',
                      fontSize: 10,
                      color: mediaZoom > 1 ? accentColor : '#666',
                      cursor: 'pointer',
                      userSelect: 'none',
                      lineHeight: 1.4,
                    }}
                  >
                    {mediaZoom.toFixed(1)}×
                  </button>
                </div>

                {mediaPreviewUrl && (
                  <div style={{ marginTop: 5, fontFamily: 'var(--font-casi-mono),monospace', fontSize: 9, color: '#555', letterSpacing: 0.5 }}>
                    Drag to pan · scroll to zoom
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
