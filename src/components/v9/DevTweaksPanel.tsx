'use client';

import { useEffect, useState } from 'react';

type Density = 'compact' | 'regular' | 'comfy';
type Tweaks = { ink: string; paper: string; density: Density };

const STORAGE_KEY = 'casi-v9-tweaks';
const DEFAULTS: Tweaks = { ink: '#0DCFB0', paper: '#0B0B0C', density: 'regular' };

const DENSITY_MAP: Record<Density, { gap: number; pad: number }> = {
  compact: { gap: 16, pad: 22 },
  regular: { gap: 24, pad: 32 },
  comfy:   { gap: 32, pad: 44 },
};

const PAIRS: Array<[string, string, string]> = [
  ['#FF5C2E', '#0B0B0C', 'Cinnabar · coal'],
  ['#0DCFB0', '#0C0D11', 'Teal · v7 default'],
  ['#9146FF', '#0E0E1A', 'Twitch'],
  ['#53FC18', '#0A1A0A', 'Kick'],
  ['#FACC15', '#101010', 'Gold'],
  ['#F472B6', '#0A0515', 'Rose'],
  ['#0B0B0C', '#F4F1EA', 'Ink on paper · light'],
  ['#FF5C2E', '#F4F1EA', 'Cinnabar · light'],
  ['#1d4ed8', '#FFFFFF', 'Royal · white'],
];

const INK_SUGGESTIONS = ['#0DCFB0', '#FF5C2E', '#9146FF', '#53FC18', '#FACC15', '#F472B6', '#06B6D4', '#0B0B0C'];
const PAPER_SUGGESTIONS = ['#0B0B0C', '#0C0D11', '#101820', '#0A0515', '#F4F1EA', '#FFFFFF', '#F0EBE0'];

function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Standard relative luminance, threshold tuned to match v9's behavior.
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return L > 0.55;
}

function applyTweaks(t: Tweaks) {
  const root = document.documentElement;
  root.style.setProperty('--ink', t.ink);
  root.style.setProperty('--paper', t.paper);
  root.setAttribute('data-paper', isLightColor(t.paper) ? 'light' : 'dark');
  const d = DENSITY_MAP[t.density];
  root.style.setProperty('--gap', `${d.gap}px`);
  root.style.setProperty('--pad', `${d.pad}px`);
}

/**
 * Floating Tweaks panel — port of v9's tweaks-panel.jsx. Lets a developer
 * preview the design with different (ink, paper) pairs and density. Writes
 * to `localStorage.${STORAGE_KEY}` and applies live by mutating `--ink` /
 * `--paper` on `<html>` (plus `data-paper` for light/dark and `--gap`/`--pad`
 * for density).
 *
 * Renders only outside production. SkinProvider / UserSkinProvider may
 * overwrite these vars on subsequent renders — that's acceptable for a dev
 * tool, where the workflow is "open the panel, twiddle, see the result".
 */
export function DevTweaksPanel() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<Tweaks>(DEFAULTS);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production') return;
    // Hydration-gated client-only init — first render is SSR-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(true);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Tweaks>;
        setT({ ...DEFAULTS, ...parsed });
      }
    } catch {
      // bad JSON → ignore
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    applyTweaks(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    } catch {
      // private-mode Safari → tweak applies for the session
    }
  }, [enabled, t]);

  if (!enabled) return null;

  const update = (patch: Partial<Tweaks>) => setT((prev) => ({ ...prev, ...patch }));

  return (
    <>
      {open ? (
        <div className="casi-v9-tw-panel" role="dialog" aria-label="v9 tweaks">
          <div className="casi-v9-tw-head">
            <span className="casi-v9-tw-title">Tweaks</span>
            <button
              type="button"
              className="casi-v9-tw-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="casi-v9-tw-section">Palette pairs</div>
          <div className="casi-v9-tw-pairs">
            {PAIRS.map(([ink, paper, label]) => {
              const active = ink === t.ink && paper === t.paper;
              return (
                <button
                  key={label}
                  type="button"
                  className={`casi-v9-tw-pair${active ? ' casi-v9-tw-active' : ''}`}
                  onClick={() => update({ ink, paper })}
                  title={label}
                >
                  <span className="casi-v9-tw-pair-paper" style={{ background: paper }}>
                    <span className="casi-v9-tw-pair-ink" style={{ background: ink }} />
                  </span>
                  <span className="casi-v9-tw-pair-lbl">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="casi-v9-tw-section">Ink</div>
          <div className="casi-v9-tw-row">
            <input
              type="color"
              aria-label="Ink"
              value={t.ink}
              onChange={(e) => update({ ink: e.target.value })}
            />
            <input
              type="text"
              className="casi-v9-tw-hex"
              value={t.ink}
              onChange={(e) => update({ ink: e.target.value })}
              spellCheck={false}
            />
          </div>
          <div className="casi-v9-tw-swatches">
            {INK_SUGGESTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className="casi-v9-tw-swatch"
                style={{ background: c }}
                onClick={() => update({ ink: c })}
                aria-label={`Ink ${c}`}
              />
            ))}
          </div>

          <div className="casi-v9-tw-section">Paper</div>
          <div className="casi-v9-tw-row">
            <input
              type="color"
              aria-label="Paper"
              value={t.paper}
              onChange={(e) => update({ paper: e.target.value })}
            />
            <input
              type="text"
              className="casi-v9-tw-hex"
              value={t.paper}
              onChange={(e) => update({ paper: e.target.value })}
              spellCheck={false}
            />
          </div>
          <div className="casi-v9-tw-swatches">
            {PAPER_SUGGESTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className="casi-v9-tw-swatch"
                style={{ background: c }}
                onClick={() => update({ paper: c })}
                aria-label={`Paper ${c}`}
              />
            ))}
          </div>

          <div className="casi-v9-tw-section">Density</div>
          <div className="casi-v9-tw-radio">
            {(['compact', 'regular', 'comfy'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`casi-v9-tw-radio-btn${t.density === d ? ' casi-v9-tw-active' : ''}`}
                onClick={() => update({ density: d })}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="casi-v9-tw-section">Reset</div>
          <button
            type="button"
            className="casi-v9-tw-reset"
            onClick={() => setT(DEFAULTS)}
          >
            Restore defaults
          </button>

          <p className="casi-v9-tw-foot">
            Two roots — <b>ink</b> and <b>paper</b>. Surfaces, borders, text scale derive via{' '}
            <code>color-mix</code>.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="casi-v9-tw-fab"
          onClick={() => setOpen(true)}
          aria-label="Open tweaks panel"
          title="v9 tweaks"
        >
          <span className="casi-v9-tw-fab-ink" style={{ background: t.ink }} />
          <span className="casi-v9-tw-fab-paper" style={{ background: t.paper }} />
        </button>
      )}

      <style jsx>{`
        .casi-v9-tw-fab {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 2147483645;
          display: flex;
          align-items: center;
          gap: 0;
          padding: 0;
          width: 56px;
          height: 28px;
          border: 1px solid #2a2a30;
          background: #1a1a1f;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }
        .casi-v9-tw-fab-ink,
        .casi-v9-tw-fab-paper {
          flex: 1;
          align-self: stretch;
        }
        .casi-v9-tw-panel {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 2147483645;
          width: 280px;
          max-height: calc(100vh - 100px);
          overflow-y: auto;
          padding: 14px 16px 16px;
          background: #f6f1e8;
          color: #29261b;
          border: 1px solid #d6cfbf;
          box-shadow: 0 14px 50px rgba(0, 0, 0, 0.28);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 12px;
        }
        .casi-v9-tw-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .casi-v9-tw-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #6c6450;
        }
        .casi-v9-tw-close {
          padding: 0 4px;
          background: transparent;
          color: #6c6450;
          border: none;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }
        .casi-v9-tw-close:hover {
          color: #29261b;
        }
        .casi-v9-tw-section {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #8c8470;
          margin: 10px 0 6px;
        }
        .casi-v9-tw-pairs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }
        .casi-v9-tw-pair {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 4px;
          padding: 4px;
          background: #fff;
          border: 1px solid #d6cfbf;
          cursor: pointer;
        }
        .casi-v9-tw-pair.casi-v9-tw-active {
          outline: 2px solid #29261b;
        }
        .casi-v9-tw-pair-paper {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 26px;
        }
        .casi-v9-tw-pair-ink {
          width: 14px;
          height: 14px;
          border-radius: 50%;
        }
        .casi-v9-tw-pair-lbl {
          font-size: 8.5px;
          letter-spacing: 0.04em;
          color: #6c6450;
          text-align: center;
          line-height: 1.2;
        }
        .casi-v9-tw-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .casi-v9-tw-row input[type='color'] {
          width: 28px;
          height: 28px;
          padding: 0;
          background: transparent;
          border: 1px solid #d6cfbf;
          cursor: pointer;
        }
        .casi-v9-tw-hex {
          flex: 1;
          padding: 6px 8px;
          font-family: ui-monospace, monospace;
          font-size: 11px;
          background: #fff;
          border: 1px solid #d6cfbf;
          color: #29261b;
        }
        .casi-v9-tw-swatches {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 6px;
        }
        .casi-v9-tw-swatch {
          width: 18px;
          height: 18px;
          border: 1px solid #d6cfbf;
          padding: 0;
          cursor: pointer;
        }
        .casi-v9-tw-radio {
          display: flex;
          gap: 4px;
        }
        .casi-v9-tw-radio-btn {
          flex: 1;
          padding: 6px 0;
          background: #fff;
          color: #6c6450;
          border: 1px solid #d6cfbf;
          font-size: 10.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .casi-v9-tw-radio-btn.casi-v9-tw-active {
          background: #29261b;
          color: #f6f1e8;
          border-color: #29261b;
        }
        .casi-v9-tw-reset {
          width: 100%;
          padding: 7px 0;
          background: transparent;
          color: #6c6450;
          border: 1px solid #d6cfbf;
          font-size: 11px;
          letter-spacing: 0.04em;
          cursor: pointer;
        }
        .casi-v9-tw-reset:hover {
          color: #29261b;
          border-color: #29261b;
        }
        .casi-v9-tw-foot {
          font-size: 10.5px;
          line-height: 1.5;
          color: rgba(41, 38, 27, 0.7);
          margin-top: 12px;
        }
        .casi-v9-tw-foot code {
          font-family: ui-monospace, monospace;
          font-size: 10px;
          background: rgba(41, 38, 27, 0.08);
          padding: 1px 4px;
        }
      `}</style>
    </>
  );
}
