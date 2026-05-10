'use client';

import { SKINS } from '@/lib/skins';

type Props = {
  activeSkin: string | null;
  savedSkin: string | null;
  saving: boolean;
  onSelect: (skinId: string) => void;
  onSave: () => Promise<void> | void;
};

export default function SkinPickerCard({ activeSkin, savedSkin, saving, onSelect, onSave }: Props) {
  const effective = activeSkin ?? 'casi-dark';
  const saved = savedSkin ?? 'casi-dark';
  const saveDisabled = saving || effective === saved;

  return (
    <div className="set-card">
      <div className="set-title">Studio skin</div>
      <div className="set-sub">Changes the colour palette for your admin view and viewer overlay</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {SKINS.map(s => {
          const isActive = effective === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: isActive ? 'rgba(var(--casi-accent-rgb),0.1)' : 'rgba(255,255,255,0.03)',
                border: isActive ? '1px solid rgba(var(--casi-accent-rgb),0.4)' : '1px solid var(--casi-border)',
                borderRadius: 10, padding: '8px 12px', cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', gap: 2 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: s.accent }} />
                <div style={{ width: 10, height: 10, borderRadius: 2, background: s.accent2 }} />
                <div style={{ width: 10, height: 10, borderRadius: 2, background: s.bg, border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <span style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 11, color: isActive ? 'var(--casi-accent)' : 'var(--casi-text-muted)', letterSpacing: 0.5 }}>{s.name}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onSave}
        disabled={saveDisabled}
        className="btn-sm b-orange"
        style={{ minWidth: 120, opacity: saveDisabled ? 0.5 : 1 }}
      >
        {saving ? 'Saving…' : 'Save skin'}
      </button>
    </div>
  );
}
