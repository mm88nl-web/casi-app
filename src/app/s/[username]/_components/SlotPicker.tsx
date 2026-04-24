'use client';

export type SlotShape = 'hex' | 'circle' | 'banner' | 'rounded' | 'rect' | 'backdrop';

export type Slot = {
  id: string;
  name: string;
  shape: SlotShape;
  priceRange: string;
  taken?: { remainingLabel: string };
};

function ShapeThumb({ shape }: { shape: SlotShape }) {
  const baseSh: React.CSSProperties = {
    width: '62%',
    height: '62%',
    background:
      'linear-gradient(135deg, rgba(var(--casi-accent-rgb), 0.55), rgba(var(--casi-accent2-rgb), 0.35))',
  };

  if (shape === 'hex') {
    return (
      <div
        style={{
          ...baseSh,
          clipPath:
            'polygon(25% 5%, 75% 5%, 97% 50%, 75% 95%, 25% 95%, 3% 50%)',
        }}
      />
    );
  }
  if (shape === 'circle') return <div style={{ ...baseSh, borderRadius: '50%' }} />;
  if (shape === 'rounded') return <div style={{ ...baseSh, borderRadius: '7px' }} />;
  if (shape === 'rect') return <div style={{ ...baseSh, borderRadius: '2px' }} />;
  if (shape === 'banner') {
    return (
      <div
        style={{
          width: '90%',
          height: '22%',
          background: '#0a0a0a',
          border: '1px solid rgba(var(--casi-accent-rgb), 0.5)',
          borderRadius: '2px',
        }}
      />
    );
  }
  // backdrop
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background:
          'linear-gradient(135deg, rgba(var(--casi-accent-rgb), 0.25), rgba(var(--casi-accent2-rgb), 0.15))',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '38%',
          height: '58%',
          background: '#222',
          borderRadius: '50% 50% 0 0 / 22% 22% 0 0',
        }}
      />
    </div>
  );
}

type Props = {
  slots: Slot[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function SlotPicker({ slots, selectedId, onSelect }: Props) {
  const selected = slots.find((s) => s.id === selectedId);
  const availableCount = slots.filter((s) => !s.taken).length;

  return (
    <section
      style={{
        padding: '16px 20px 18px',
        borderBottom: '1px solid var(--casi-border)',
        background:
          'linear-gradient(180deg, rgba(var(--casi-accent-rgb), 0.02), transparent)',
      }}
    >
      <div
        className="flex items-center justify-between font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.2em',
          color: 'var(--casi-text-dim)',
          marginBottom: '10px',
        }}
      >
        <span>Pick a slot</span>
        <span style={{ color: 'var(--casi-accent2)' }}>
          {availableCount} available
        </span>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
      >
        {slots.map((slot) => {
          const sel = slot.id === selectedId;
          const taken = !!slot.taken;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => !taken && onSelect(slot.id)}
              disabled={taken}
              className="relative flex items-center gap-2.5 overflow-hidden transition-all"
              style={{
                padding: '10px 10px 10px 12px',
                background: sel
                  ? 'linear-gradient(180deg, rgba(var(--casi-accent-rgb), 0.07), rgba(var(--casi-accent-rgb), 0.02))'
                  : 'var(--casi-bg)',
                border: `1px solid ${sel ? 'var(--casi-accent)' : 'var(--casi-border-2)'}`,
                borderRadius: '10px',
                cursor: taken ? 'not-allowed' : 'pointer',
                opacity: taken ? 0.45 : 1,
                boxShadow: sel ? '0 0 0 1px var(--casi-accent) inset' : 'none',
                textAlign: 'left',
              }}
            >
              <div
                className="flex items-center justify-center shrink-0 overflow-hidden relative"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '6px',
                  background: '#0a0a0a',
                  border: '1px solid var(--casi-border-2)',
                }}
              >
                <ShapeThumb shape={slot.shape} />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span
                  className="font-bold truncate"
                  style={{
                    fontSize: '13px',
                    letterSpacing: '-0.2px',
                    color: sel ? 'var(--casi-accent)' : 'var(--casi-text)',
                  }}
                >
                  {slot.name}
                </span>
                <span
                  className="font-mono uppercase flex gap-1.5"
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.14em',
                    color: 'var(--casi-text-faint)',
                  }}
                >
                  <span>{slot.shape}</span>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <span style={{ color: 'var(--casi-accent)' }}>{slot.priceRange}</span>
                </span>
              </div>
              {taken ? (
                <span
                  className="absolute font-mono uppercase"
                  style={{
                    top: '4px',
                    right: '6px',
                    fontSize: '8px',
                    letterSpacing: '0.14em',
                    color: 'var(--casi-text-faint)',
                  }}
                >
                  Taken · {slot.taken!.remainingLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div
          className="font-mono"
          style={{
            marginTop: '10px',
            fontSize: '10px',
            letterSpacing: '0.05em',
            color: 'var(--casi-text-dim)',
            lineHeight: 1.5,
          }}
        >
          <b style={{ color: 'var(--casi-text)', fontWeight: 500 }}>
            {selected.name} · {selected.shape}.
          </b>{' '}
          Upload a logo, GIF or short clip — we&apos;ll mask it to the shape.
        </div>
      ) : null}
    </section>
  );
}
