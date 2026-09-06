'use client';

import { SKINS } from '@/lib/skins';
import { useUserSkin } from '@/components/UserSkinProvider';

const GROUPS: { id: string; label: string }[] = [
  { id: 'light',  label: 'Light' },
  { id: 'dark',   label: 'Dark' },
  { id: 'custom', label: 'Custom' },
];

// Active-card chrome is fixed Casi chrome, not a skin value — this picker
// lives in /studio/settings, which stays on the brand palette regardless of
// which skin is selected/previewed. Matches the redesign handoff spec.
const ACTIVE_BORDER = '#294B3C';
const ACTIVE_FILL    = 'rgba(41, 75, 60, 0.07)';
const CHECK_BG        = 'rgba(0, 0, 0, 0.55)';

export default function SkinPicker() {
  const { skinId, setSkinId, inkColor, paperColor, accent2Color } = useUserSkin();

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
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.12em',
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
                      padding: '11px 13px',
                      background: active ? ACTIVE_FILL : 'var(--casi-bg)',
                      border: `1px solid ${active ? ACTIVE_BORDER : 'var(--casi-border-2)'}`,
                      borderRadius: 'var(--radius-card)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    aria-pressed={active}
                  >
                    {/* Three-band swatch — paper / ink / accent2, top to
                        bottom, per the redesign handoff spec. Custom tile
                        shows the stored custom colours when set, otherwise
                        a dotted placeholder. */}
                    {(() => {
                      const swatchPaper   = isCustom ? (paperColor   ?? skin.paper)   : skin.paper;
                      const swatchInk     = isCustom ? (inkColor     ?? skin.ink)     : skin.ink;
                      const swatchAccent2 = isCustom ? (accent2Color ?? skin.accent2) : skin.accent2;
                      const hasCustomColors = isCustom && (inkColor || paperColor || accent2Color);
                      return (
                        <span
                          aria-hidden
                          className="relative flex flex-col shrink-0 overflow-hidden"
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            border: `1px solid ${skin.border}`,
                            outline: isCustom && !hasCustomColors ? '1px dashed var(--casi-text-faint)' : 'none',
                            outlineOffset: -3,
                          }}
                        >
                          {isCustom && !hasCustomColors ? (
                            <span
                              className="flex items-center justify-center w-full h-full"
                              style={{ color: 'var(--casi-text-muted)', fontSize: 14, background: skin.paper }}
                            >
                              ＋
                            </span>
                          ) : (
                            <>
                              <span style={{ flex: 1, background: swatchPaper }} />
                              <span style={{ flex: 1, background: swatchInk }} />
                              <span style={{ flex: 1, background: swatchAccent2 }} />
                            </>
                          )}
                          {active && (
                            <span
                              className="absolute inset-0 flex items-center justify-center font-bold"
                              style={{ background: CHECK_BG, color: '#fff', fontSize: 14 }}
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
                          color: active ? ACTIVE_BORDER : 'var(--casi-text)',
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
                        {isCustom ? 'pick your own' : skin.ink}
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
