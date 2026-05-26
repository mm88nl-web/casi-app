'use client';

import type { CSSProperties } from 'react';

// Eye / lock SVGs are inlined to match the v9 mockup exactly without pulling
// in an icon library. stroke-width is consumed via currentColor so the v9
// .casi-v9-lyr-tog hover/off states drive color naturally.
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function LockOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}
function LockClosedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export type LayerItem = {
  id: string;
  shape: 'rect' | 'rounded' | 'circle' | 'hex' | 'custom' | 'banner' | 'backdrop' | null;
  label: string;
  /** e.g. "$5/min · idle" or "$8/min · LIVE 4:21" */
  meta: string;
  isLive: boolean;
  isLocked: boolean;
  isBackground: boolean;
};

type Props = {
  layers: LayerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onToggleLock?: (id: string, current: boolean) => void;
};

/**
 * v9 Layers panel — sits to the left of the canvas in the 3-col editor.
 * Read-only listing of overlay_elements with z-order grip, a v9 shape glyph
 * adapted to the slot's shape, the slot's price meta, a live pip when a
 * booking is currently airing on it, and visibility / lock toggles.
 *
 * Visibility toggle is currently visual only (the editor doesn't actually
 * hide slots from the canvas — they always render). Lock wires through to
 * `onToggleLock` so streamers can pin a slot in place from the Layers list
 * without selecting it on the canvas.
 */
export default function StudioLayersPanel({
  layers,
  selectedId,
  onSelect,
  onAdd,
  onToggleLock,
}: Props) {
  return (
    <aside className="casi-v9-lyr-panel">
      <div className="casi-v9-lyr-hd">
        <span>Layers · {layers.length}</span>
        {onAdd ? (
          <button type="button" className="casi-v9-lyr-hd-add" title="Add slot" onClick={onAdd}>
            +
          </button>
        ) : null}
      </div>
      <div className="casi-v9-lyr-list">
        {layers.length === 0 ? (
          <div
            style={{
              padding: '20px 12px',
              fontFamily: 'var(--M)',
              fontSize: 10.5,
              color: 'var(--text-4)',
              letterSpacing: '0.06em',
              textAlign: 'center',
            }}
          >
            No slots yet
          </div>
        ) : (
          layers.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`casi-v9-lyr-item${selectedId === l.id ? ' casi-v9-sel' : ''}`}
              onClick={() => onSelect(l.id)}
            >
              <span className="casi-v9-lyr-grip" aria-hidden>
                ⋮⋮
              </span>
              {l.isLive ? <span className="casi-v9-lyr-live-pip" aria-hidden /> : null}
              <LayerIcon layer={l} />
              <span className="casi-v9-lyr-name">
                {l.label}
                <small>{l.meta}</small>
              </span>
              <div className="casi-v9-lyr-toggles">
                <span className="casi-v9-lyr-tog" title="Visible" aria-hidden>
                  <EyeIcon />
                </span>
                <button
                  type="button"
                  className={`casi-v9-lyr-tog${l.isLocked ? '' : ' casi-v9-off'}`}
                  title={l.isLocked ? 'Locked' : 'Unlocked'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLock?.(l.id, l.isLocked);
                  }}
                  style={lockBtnStyle}
                >
                  {l.isLocked ? <LockClosedIcon /> : <LockOpenIcon />}
                </button>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function LayerIcon({ layer }: { layer: LayerItem }) {
  if (layer.isBackground) {
    return (
      <span className="casi-v9-lyr-icn casi-v9-backdrop" aria-hidden>
        ▢
      </span>
    );
  }
  if (layer.isLive) {
    return (
      <span className="casi-v9-lyr-icn" aria-hidden>
        ▶
      </span>
    );
  }
  switch (layer.shape) {
    case 'circle':
      return <span className="casi-v9-lyr-icn casi-v9-cir" aria-hidden>●</span>;
    case 'hex':
      return <span className="casi-v9-lyr-icn casi-v9-hex" aria-hidden />;
    case 'banner':
      return <span className="casi-v9-lyr-icn casi-v9-bnr" aria-hidden />;
    case 'rounded':
      return (
        <span
          className="casi-v9-lyr-icn"
          aria-hidden
          style={{ borderRadius: 4 }}
        >
          ▢
        </span>
      );
    case 'rect':
    default:
      return (
        <span className="casi-v9-lyr-icn" aria-hidden>
          ✦
        </span>
      );
  }
}

const lockBtnStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
};
