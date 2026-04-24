'use client';

import { useState } from 'react';

const SHAPES = [
  { id: 'rect', label: 'rect' },
  { id: 'rounded', label: 'rounded' },
  { id: 'circle', label: 'circle' },
  { id: 'hex', label: 'hex' },
  { id: 'banner', label: 'banner' },
  { id: 'backdrop', label: 'backdrop' },
] as const;

type Shape = (typeof SHAPES)[number]['id'];

type Props = {
  slotName: string;
  dimensions: string;
};

function ShapeThumb({ shape, selected }: { shape: Shape; selected: boolean }) {
  const base: React.CSSProperties = {
    width: '26px',
    height: '26px',
    background:
      'linear-gradient(135deg, rgba(var(--casi-accent-rgb), 0.35), rgba(var(--casi-accent2-rgb), 0.25))',
    border: `1px solid ${selected ? 'var(--casi-accent)' : 'rgba(var(--casi-accent-rgb), 0.35)'}`,
    position: 'relative',
    overflow: 'hidden',
  };

  if (shape === 'hex') {
    return (
      <div
        style={{
          ...base,
          clipPath: 'polygon(25% 5%, 75% 5%, 97% 50%, 75% 95%, 25% 95%, 3% 50%)',
          border: 'none',
        }}
      />
    );
  }
  if (shape === 'circle') return <div style={{ ...base, borderRadius: '50%' }} />;
  if (shape === 'rounded') return <div style={{ ...base, borderRadius: '6px' }} />;
  if (shape === 'rect') return <div style={{ ...base, borderRadius: '2px' }} />;
  if (shape === 'banner') {
    return (
      <div
        style={{
          ...base,
          width: '32px',
          height: '10px',
          margin: '8px 0',
          borderRadius: '2px',
          background: '#0a0a0a',
          borderColor: 'rgba(var(--casi-accent-rgb), 0.5)',
        }}
      />
    );
  }
  return (
    <div style={{ ...base, borderRadius: '3px' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '32%',
          height: '55%',
          background: '#222',
          borderRadius: '50% 50% 0 0 / 20% 20% 0 0',
        }}
      />
    </div>
  );
}

function MiniToggle({ on, label, onChange }: { on: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-2 transition-colors"
      style={{
        padding: '10px 12px',
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        className="relative shrink-0"
        style={{
          width: '30px',
          height: '18px',
          borderRadius: '999px',
          background: on ? 'var(--casi-accent)' : 'var(--casi-border-2)',
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: on ? '14px' : '2px',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
          }}
        />
      </span>
      <span style={{ fontSize: '12px', color: 'var(--casi-text)' }}>{label}</span>
    </button>
  );
}

export default function SlotConfigurator({ slotName, dimensions }: Props) {
  const [shape, setShape] = useState<Shape>('rect');
  const [min, setMin] = useState('5');
  const [max, setMax] = useState('50');
  const [duration, setDuration] = useState('3 min');
  const [manualApproval, setManualApproval] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [blockRules, setBlockRules] = useState<string[]>(['NSFW', 'Political', 'Gambling']);

  const RULES = ['NSFW', 'Political', 'Gambling', 'Crypto', 'Alcohol'];
  const toggleRule = (rule: string) =>
    setBlockRules((prev) => (prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]));

  return (
    <section
      className="flex flex-col gap-3.5"
      style={{
        background: 'var(--casi-bg)',
        border: '1px solid var(--casi-border-2)',
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <div
            className="font-extrabold"
            style={{
              fontFamily: 'var(--font-casi-sans)',
              fontSize: '18px',
              letterSpacing: '-0.3px',
              color: 'var(--casi-text)',
            }}
          >
            {slotName}
          </div>
          <div
            className="font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: 'var(--casi-text-dim)',
              marginTop: '2px',
            }}
          >
            {dimensions}
          </div>
        </div>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '9px',
            letterSpacing: '0.15em',
            color: 'var(--casi-accent)',
            padding: '4px 8px',
            background: 'rgba(var(--casi-accent-rgb), 0.1)',
            borderRadius: '999px',
          }}
        >
          Editing
        </span>
      </header>

      <div>
        <Label>Shape</Label>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          {SHAPES.map((opt) => {
            const sel = opt.id === shape;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setShape(opt.id)}
                className="flex flex-col items-center gap-1.5 transition-colors"
                style={{
                  padding: '9px 4px 6px',
                  background: sel ? 'rgba(var(--casi-accent-rgb), 0.08)' : 'var(--casi-surface)',
                  border: `1px solid ${sel ? 'var(--casi-accent)' : 'var(--casi-border)'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <ShapeThumb shape={opt.id} selected={sel} />
                <span
                  className="font-mono uppercase"
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.08em',
                    color: sel ? 'var(--casi-accent)' : 'var(--casi-text-faint)',
                  }}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Field label="Min · €">
          <NumberInput value={min} onChange={setMin} />
        </Field>
        <Field label="Max · €">
          <NumberInput value={max} onChange={setMax} />
        </Field>
        <Field label="Duration">
          <NumberInput value={duration} onChange={setDuration} />
        </Field>
      </div>

      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <MiniToggle label="Manual approval required" on={manualApproval} onChange={setManualApproval} />
        <MiniToggle label="Enabled on stream" on={enabled} onChange={setEnabled} />
      </div>

      <div>
        <Label>Auto-block</Label>
        <div className="flex flex-wrap gap-1.5">
          {RULES.map((rule) => {
            const on = blockRules.includes(rule);
            return (
              <button
                key={rule}
                type="button"
                onClick={() => toggleRule(rule)}
                className="font-mono uppercase"
                style={{
                  padding: '6px 12px',
                  borderRadius: '999px',
                  background: on ? 'rgba(var(--casi-accent-rgb), 0.15)' : 'var(--casi-surface)',
                  border: `1px solid ${on ? 'var(--casi-accent)' : 'var(--casi-border)'}`,
                  color: on ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  cursor: 'pointer',
                }}
              >
                {rule}
              </button>
            );
          })}
          <span
            className="font-mono uppercase"
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              background: 'transparent',
              border: '1px dashed var(--casi-border-2)',
              color: 'var(--casi-text-dim)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >
            + add rule
          </span>
        </div>
      </div>
    </section>
  );
}

function Label({ children }: { children: string }) {
  return (
    <label
      className="mb-1.5 block font-mono uppercase"
      style={{
        fontSize: '9px',
        letterSpacing: '0.15em',
        color: 'var(--casi-text-faint)',
      }}
    >
      {children}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full font-mono outline-none transition-colors"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '8px',
        padding: '10px 12px',
        fontSize: '14px',
        color: 'var(--casi-text)',
      }}
    />
  );
}
