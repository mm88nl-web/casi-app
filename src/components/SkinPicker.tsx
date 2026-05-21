'use client';

import { SKINS } from '@/lib/skins';
import { useUserSkin } from '@/components/UserSkinProvider';

// Pre-grouped so the picker can render section headers without re-walking
// the array on every render. Order here drives display order.
const GROUPS: { id: string; label: string }[] = [
  { id: 'casi',     label: 'Presets' },
  { id: 'platform', label: 'Platforms' },
  { id: 'custom',   label: 'Yours' },
];

export default function SkinPicker() {
  const { skinId, setSkinId, inkColor, paperColor } = useUserSkin();

  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((group) => {
        const items = SKINS.filter((s) => (s.category ?? 'casi') === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col gap-2">
            <div
              className="font-mono uppercase"
              style={{
                fontSize: 9,
                letterSpacing: '0.18em',
                color: 'var(--casi-text-faint)',
                marginLeft: 2,
              }}
            >
              {group.label}
            </div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
            >
              {items.map((skin) => {
                const active = skin.id === skinId;
                const isCustom = skin.id === 'custom';
                return (
                  <button
                    key={skin.id}
                    type="button"
                    onClick={() => setSkinId(skin.id)}
                    className="flex items-center gap-3 transition-colors"
                    style={{
                      padding: '10px 12px',
                      background: active
                        ? 'rgba(var(--casi-accent-rgb), 0.06)'
                        : 'var(--casi-bg)',
                      border: `1px solid ${active ? 'var(--casi-accent)' : 'var(--casi-border-2)'}`,
                      borderRadius: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    aria-pressed={active}
                  >
                    {/* Two-tone swatch — ink on the left, paper on the right.
                        Custom tile shows the stored custom colours when set,
                        otherwise a dotted placeholder. */}
                    {(() => {
                      const swatchInk   = isCustom ? (inkColor   ?? skin.ink)   : skin.ink;
                      const swatchPaper = isCustom ? (paperColor ?? skin.paper) : skin.paper;
                      const hasCustomColors = isCustom && (inkColor || paperColor);
                      return (
                        <span
                          aria-hidden
                          className="relative flex shrink-0 overflow-hidden"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 0,
                            background: swatchPaper,
                            border: `1px solid ${skin.border}`,
                            outline: isCustom && !hasCustomColors ? '1px dashed var(--casi-text-faint)' : 'none',
                            outlineOffset: -3,
                          }}
                        >
                          {hasCustomColors ? (
                            <>
                              <span style={{ flex: 1, background: swatchInk }} />
                              <span style={{ flex: 1, background: swatchPaper }} />
                            </>
                          ) : isCustom ? (
                            <span
                              className="flex items-center justify-center w-full"
                              style={{ color: 'var(--casi-text-muted)', fontSize: 14 }}
                            >
                              ＋
                            </span>
                          ) : (
                            <>
                              <span style={{ flex: 1, background: skin.ink }} />
                              <span style={{ flex: 1, background: skin.paper }} />
                            </>
                          )}
                          {active && (
                            <span
                              className="absolute inset-0 flex items-center justify-center font-bold"
                              style={{ background: 'rgba(0, 0, 0, 0.55)', color: '#fff', fontSize: 14 }}
                            >
                              ✓
                            </span>
                          )}
                        </span>
                      );
                    })()}

                    <div className="flex flex-col min-w-0">
                      <span
                        className="font-bold truncate"
                        style={{
                          fontFamily: 'var(--font-casi-sans)',
                          fontSize: 13,
                          color: active ? 'var(--casi-accent)' : 'var(--casi-text)',
                          letterSpacing: '-0.2px',
                        }}
                      >
                        {skin.name}
                      </span>
                      <span
                        className="font-mono uppercase truncate"
                        style={{
                          fontSize: 9,
                          letterSpacing: '0.15em',
                          color: 'var(--casi-text-faint)',
                          marginTop: 2,
                        }}
                      >
                        {isCustom ? 'pick your own' : skin.isLight ? 'light' : skin.ink}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
