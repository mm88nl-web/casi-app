'use client';

import { SKINS } from '@/lib/skins';
import { useUserSkin } from '@/components/UserSkinProvider';

export default function SkinPicker() {
  const { skinId, setSkinId } = useUserSkin();

  return (
    <div
      className="grid gap-2.5"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      }}
    >
      {SKINS.map((skin) => {
        const active = skin.id === skinId;
        return (
          <button
            key={skin.id}
            type="button"
            onClick={() => setSkinId(skin.id)}
            className="flex items-center gap-3 transition-colors"
            style={{
              padding: '12px 14px',
              background: active
                ? 'rgba(var(--casi-accent-rgb), 0.06)'
                : 'var(--casi-bg)',
              border: `1px solid ${active ? 'var(--casi-accent)' : 'var(--casi-border-2)'}`,
              borderRadius: '10px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            aria-pressed={active}
          >
            {/* Swatch: a two-colour preview of the skin's palette */}
            <span
              aria-hidden
              className="relative flex shrink-0 overflow-hidden"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: skin.bg,
                border: `1px solid ${skin.border}`,
              }}
            >
              <span
                style={{
                  flex: 1,
                  background: skin.accent,
                }}
              />
              <span
                style={{
                  flex: 1,
                  background: skin.accent2,
                }}
              />
              {active ? (
                <span
                  className="absolute inset-0 flex items-center justify-center font-bold"
                  style={{
                    background: 'rgba(0, 0, 0, 0.55)',
                    color: '#fff',
                    fontSize: '14px',
                  }}
                >
                  ✓
                </span>
              ) : null}
            </span>

            <div className="flex flex-col min-w-0">
              <span
                className="font-bold truncate"
                style={{
                  fontFamily: 'var(--font-casi-sans)',
                  fontSize: '13px',
                  color: active ? 'var(--casi-accent)' : 'var(--casi-text)',
                  letterSpacing: '-0.2px',
                }}
              >
                {skin.name}
              </span>
              <span
                className="font-mono uppercase truncate"
                style={{
                  fontSize: '9px',
                  letterSpacing: '0.15em',
                  color: 'var(--casi-text-faint)',
                  marginTop: '2px',
                }}
              >
                {skin.accent} · {skin.accent2}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
