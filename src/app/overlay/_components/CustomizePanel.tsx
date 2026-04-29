'use client';

import { useRef } from 'react';
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

export default function CustomizePanel({
  shape, open, onToggle,
  accentColor, accentColorRgb,
  message, bannerFontPx, onBannerFontPxChange, bannerSpeedSecs, onBannerSpeedSecsChange,
  mediaPreviewUrl, mediaPreviewFileType,
  mediaOffsetX, mediaOffsetY, onMediaOffsetChange,
  mediaZoom, onMediaZoomChange,
}: Props) {
  const isBanner = shape === 'banner';
  const isShapedMedia = shape === 'rect' || shape === 'rounded' || shape === 'circle' || shape === 'hex' || shape == null;

  // Backdrop slots cover the full canvas — there's nothing to pan/zoom
  // and no banner text. Hide the panel entirely so we don't surface
  // controls that would confuse rather than help.
  if (shape === 'backdrop') return null;

  const dragRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

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

  const fontDef   = BANNER_FONT_PX_RANGE.default;
  const speedDef  = BANNER_SPEED_SECS_RANGE.default;
  const offsetDef = MEDIA_OFFSET_RANGE.default;
  const zoomDef   = MEDIA_ZOOM_RANGE.default;
  const resetMedia = () => { onMediaOffsetChange(offsetDef, offsetDef); onMediaZoomChange(zoomDef); };
  const resetBanner = () => { onBannerFontPxChange(fontDef); onBannerSpeedSecsChange(speedDef); };

  const previewMaskCss = SHAPE_CSS[shape ?? 'rect'] ?? 'none';

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
        <span style={{ color: '#444' }}>{isBanner ? 'font · speed' : 'pan · zoom'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isBanner && (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="bf-lbl" style={{ marginBottom: 0 }}>Font size</label>
                  <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: '#666' }}>{bannerFontPx}px</span>
                </div>
                <input
                  type="range"
                  min={BANNER_FONT_PX_RANGE.min} max={BANNER_FONT_PX_RANGE.max} step={2}
                  value={bannerFontPx}
                  onChange={(e) => onBannerFontPxChange(Number(e.target.value))}
                  style={{ width: '100%', accentColor }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="bf-lbl" style={{ marginBottom: 0 }}>Scroll speed</label>
                  <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: '#666' }}>{bannerSpeedSecs}s loop</span>
                </div>
                <input
                  type="range"
                  // Reverse the range visually — sliding right should feel
                  // FASTER, but a smaller `secs` value is faster, so flip
                  // min/max in the conversion below.
                  min={BANNER_SPEED_SECS_RANGE.min} max={BANNER_SPEED_SECS_RANGE.max} step={1}
                  value={BANNER_SPEED_SECS_RANGE.max + BANNER_SPEED_SECS_RANGE.min - bannerSpeedSecs}
                  onChange={(e) => onBannerSpeedSecsChange(BANNER_SPEED_SECS_RANGE.max + BANNER_SPEED_SECS_RANGE.min - Number(e.target.value))}
                  style={{ width: '100%', accentColor }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-casi-mono),monospace', fontSize: 9, color: '#444', marginTop: 2 }}>
                  <span>slower</span><span>faster</span>
                </div>
              </div>
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
                <label className="bf-lbl">Position {mediaPreviewUrl ? '· drag preview to pan' : ''}</label>
                <div
                  ref={dragRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  style={{
                    width: '100%', aspectRatio: shape === 'circle' || shape === 'hex' ? '1 / 1' : '16 / 9',
                    background: 'var(--casi-bg)',
                    border: `1px solid rgba(${accentColorRgb},0.2)`,
                    borderRadius: 10,
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: mediaPreviewUrl ? (dragState.current ? 'grabbing' : 'grab') : 'default',
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
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${mediaOffsetX}% ${mediaOffsetY}%`, transform: `scale(${mediaZoom})`, pointerEvents: 'none' }}
                        />
                      ) : (
                        <img
                          src={mediaPreviewUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${mediaOffsetX}% ${mediaOffsetY}%`, transform: `scale(${mediaZoom})`, pointerEvents: 'none' }}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, letterSpacing: 1 }}>
                      Upload media to position it
                    </div>
                  )}
                </div>
              </div>
              {/* Explicit X / Y sliders so both axes are visible to the
                  streamer. Drag-to-pan above still works in tandem. With
                  objectFit:cover, an image whose aspect ratio matches the
                  box (e.g. portrait photo in a 1:1 circle) has no slack
                  in one axis — that slider then has no visible effect
                  until zoom is bumped above 1×, which adds slack in both
                  axes. Showing the slider regardless makes the
                  interaction discoverable. */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="bf-lbl" style={{ marginBottom: 0 }}>Horizontal</label>
                  <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: '#666' }}>{Math.round(mediaOffsetX)}%</span>
                </div>
                <input
                  type="range"
                  min={MEDIA_OFFSET_RANGE.min} max={MEDIA_OFFSET_RANGE.max} step={1}
                  value={mediaOffsetX}
                  onChange={(e) => onMediaOffsetChange(Number(e.target.value), mediaOffsetY)}
                  style={{ width: '100%', accentColor }}
                  disabled={!mediaPreviewUrl}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="bf-lbl" style={{ marginBottom: 0 }}>Vertical</label>
                  <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: '#666' }}>{Math.round(mediaOffsetY)}%</span>
                </div>
                <input
                  type="range"
                  min={MEDIA_OFFSET_RANGE.min} max={MEDIA_OFFSET_RANGE.max} step={1}
                  value={mediaOffsetY}
                  onChange={(e) => onMediaOffsetChange(mediaOffsetX, Number(e.target.value))}
                  style={{ width: '100%', accentColor }}
                  disabled={!mediaPreviewUrl}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="bf-lbl" style={{ marginBottom: 0 }}>Zoom</label>
                  <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: '#666' }}>{mediaZoom.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min={MEDIA_ZOOM_RANGE.min} max={MEDIA_ZOOM_RANGE.max} step={0.05}
                  value={mediaZoom}
                  onChange={(e) => onMediaZoomChange(Number(e.target.value))}
                  style={{ width: '100%', accentColor }}
                  disabled={!mediaPreviewUrl}
                />
              </div>
              <button onClick={resetMedia} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', fontFamily: 'var(--font-casi-mono),monospace', fontSize: 9, color: '#555', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
                ↺ Reset position
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
