'use client';

import { useRef } from 'react';
import { Rnd } from 'react-rnd';
import SlotMedia from '@/components/SlotMedia';

/**
 * One draggable slot on the streamer's editing canvas. Wraps an Rnd
 * (drag/resize) around the shape-aware visual content (banner marquee,
 * image, or empty placeholder), with a top-right delete button that
 * appears only when the slot is idle.
 *
 * Extracted from a 115-line inline body inside src/app/admin/page.tsx so
 * the page-level component is a state coordinator + map, not a wall of
 * JSX. Drag/tap distinction lives on this component's own refs — was
 * previously hoisted to the page but only ever applied to one slot at
 * a time, so per-slot is the correct scope.
 */

type Element = {
  id: string;
  shape?: string | null;
  is_background?: boolean | null;
  locked?: boolean | null;
  pos_x: number; pos_y: number; width: number; height: number;
  image_url?: string | null;
  price_value: number;
  price_unit: string;
};

type Props = {
  el: Element;
  dimensions: { width: number; height: number };
  isSelected: boolean;
  hasActiveOrQueued: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, pos: { pos_x: number; pos_y: number }) => void;
  onResize: (id: string, box: { width: number; height: number; pos_x: number; pos_y: number }) => void;
  onDelete: (id: string) => void;
};

export default function AdminSlot({
  el, dimensions, isSelected, hasActiveOrQueued,
  onSelect, onMove, onResize, onDelete,
}: Props) {
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging   = useRef(false);

  return (
    <Rnd
      size={{
        width:  el.is_background ? '100%' : `${(el.width  / 100) * dimensions.width }px`,
        height: el.is_background ? '100%' : `${(el.height / 100) * dimensions.height}px`,
      }}
      position={{
        x: el.is_background ? 0 : (el.pos_x / 100) * dimensions.width,
        y: el.is_background ? 0 : (el.pos_y / 100) * dimensions.height,
      }}
      onDragStart={(_e, d) => {
        dragStartPos.current = { x: d.x, y: d.y };
        isDragging.current = false;
      }}
      onDrag={(_e, d) => {
        if (dragStartPos.current) {
          const dist = Math.abs(d.x - dragStartPos.current.x) + Math.abs(d.y - dragStartPos.current.y);
          if (dist > 6) isDragging.current = true;
        }
      }}
      onDragStop={(_e, d) => {
        if (!isDragging.current) {
          // Tap-to-select for any slot including backdrops. Backdrops
          // need to be selectable so streamers can reach the shape
          // picker and convert back to a beam — otherwise the "convert
          // beam → backdrop" flow becomes a one-way trap.
          onSelect(el.id);
        } else {
          onMove(el.id, {
            pos_x: (d.x / dimensions.width)  * 100,
            pos_y: (d.y / dimensions.height) * 100,
          });
        }
        isDragging.current = false;
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        onResize(el.id, {
          width:  (ref.offsetWidth  / dimensions.width)  * 100,
          height: (ref.offsetHeight / dimensions.height) * 100,
          pos_x:  (pos.x / dimensions.width)  * 100,
          pos_y:  (pos.y / dimensions.height) * 100,
        });
      }}
      disableDragging={!!el.is_background}
      enableResizing={!el.is_background}
      bounds="parent"
      style={{ zIndex: el.is_background ? 0 : (isSelected ? 40 : 30) }}
    >
      <div
        style={{ position: 'relative', width: '100%', height: '100%' }}
        // Backdrops have `disableDragging` which also kills Rnd's
        // onDragStop, so tap-to-select never fires for them. Route their
        // selection through a plain React onClick on the content div
        // instead. Beams keep using onDragStop so drag-vs-tap is
        // preserved (a drag shouldn't select).
        onClick={el.is_background
          ? (e) => { e.stopPropagation(); onSelect(el.id); }
          : undefined
        }
      >
        {/* Shape-masked content box. Isolated from the delete button and
            selection indicator below so clip-path doesn't chop the corner
            × or the outer glow. For `banner` the shape is a wide thin
            rect — no mask needed; the overlay render is what swaps image
            → marquee. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            border: el.is_background ? 'none' : isSelected ? '2px solid var(--casi-accent)' : '1.5px solid rgba(var(--casi-accent-rgb),0.3)',
            borderRadius:
              el.is_background ? 0 :
              el.shape === 'rounded' ? 14 :
              6,
            opacity: el.locked ? 0.7 : 1,
            clipPath:
              el.shape === 'circle' ? 'circle(50%)' :
              el.shape === 'hex'    ? 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' :
              undefined,
          }}
        >
          {!el.image_url ? (
            el.shape === 'banner' && !el.locked ? (
              // Empty banner → scrolling placeholder so the slot is
              // visually recognisable as a banner instead of a static
              // dashed rectangle.
              <div className="banner-preview">
                <span className="banner-preview-track">
                  ▰ Banner · viewer messages scroll here · tip to try
                </span>
              </div>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1.5px dashed ${el.locked ? 'rgba(248,113,113,0.3)' : el.is_background ? 'rgba(168,85,247,0.35)' : 'rgba(var(--casi-accent-rgb),0.35)'}`, borderRadius: el.is_background ? 12 : 6, background: el.locked ? 'rgba(248,113,113,0.04)' : el.is_background ? 'rgba(168,85,247,0.04)' : 'rgba(var(--casi-accent-rgb),0.04)' }}>
                {el.locked && <span style={{ fontFamily: 'var(--font-casi-mono), monospace', fontSize: 10, color: 'rgba(248,113,113,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>🔒 Locked</span>}
                <span style={{ fontSize: el.is_background ? 24 : 16, marginBottom: 4 }}>{el.is_background ? '🖼️' : el.shape === 'banner' ? '▰' : '✦'}</span>
                <span style={{ fontFamily: 'var(--font-casi-mono), monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: el.locked ? 'rgba(248,113,113,0.5)' : el.is_background ? 'rgba(168,85,247,0.6)' : 'rgba(var(--casi-accent-rgb),0.6)' }}>
                  {el.locked ? 'No requests' : el.is_background ? 'Backdrop' : el.shape === 'banner' ? 'Banner' : 'Beam'}
                </span>
                {el.price_value > 0 && !el.locked && <span style={{ fontFamily: 'var(--font-casi-mono), monospace', fontSize: 11, fontWeight: 500, marginTop: 3, color: el.is_background ? 'rgba(168,85,247,0.9)' : 'var(--casi-accent)' }}>${el.price_value}/{el.price_unit}</span>}
              </div>
            )
          ) : (
            <SlotMedia src={el.image_url} fileType={null} style={{ width: '100%', height: '100%', objectFit: el.is_background ? 'cover' : 'contain', pointerEvents: 'none' }} />
          )}
        </div>

        {/* Selection glow */}
        {isSelected && !el.is_background && (
          <div style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, border: '2px solid var(--casi-accent)', borderRadius: 8, pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(var(--casi-accent-rgb),0.15)' }} />
        )}

        {/* Delete button — only surface when the slot is idle. Deleting
            a slot with a live or queued booking drops the row without
            settling the escrow, which leaves USDC stuck in the on-chain
            vault AND orphans queue rows that still point at a now-
            missing element_id. End Early is the right path for live
            beams; deletion is for cleanup only. */}
        {!el.is_background && !hasActiveOrQueued && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(el.id); }}
            style={{ position: 'absolute', top: 0, right: 0, width: 32, height: 32, background: 'rgba(239,68,68,0.9)', border: 'none', borderRadius: '0 6px 0 6px', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          >
            ✕
          </button>
        )}
      </div>
    </Rnd>
  );
}
