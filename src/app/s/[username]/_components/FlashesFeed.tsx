'use client';

export type Flash = {
  id: string;
  time: string;
  who: string;
  message: string;
  chip: { kind: 'free' | 'usdc' | 'eur'; label: string };
  mine?: boolean;
  fresh?: boolean;
};

const CHIP_STYLES: Record<Flash['chip']['kind'], { bg: string; fg: string; border: string }> = {
  free: {
    bg: 'rgba(100, 220, 160, 0.1)',
    fg: '#5ee0a3',
    border: 'rgba(100, 220, 160, 0.25)',
  },
  usdc: {
    bg: 'rgba(153, 69, 255, 0.12)',
    fg: '#b98bff',
    border: 'rgba(153, 69, 255, 0.25)',
  },
  eur: {
    bg: 'rgba(var(--casi-accent-rgb), 0.12)',
    fg: 'var(--casi-accent)',
    border: 'rgba(var(--casi-accent-rgb), 0.25)',
  },
};

function FlashRow({ flash }: { flash: Flash }) {
  const chip = CHIP_STYLES[flash.chip.kind];
  return (
    <div
      className="grid items-center gap-2.5 transition-colors"
      style={{
        gridTemplateColumns: 'auto auto 1fr',
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid transparent',
        background: flash.mine ? 'rgba(var(--casi-accent-rgb), 0.05)' : 'transparent',
        borderColor: flash.mine ? 'rgba(var(--casi-accent-rgb), 0.15)' : 'transparent',
      }}
    >
      <span
        className="font-mono"
        style={{
          fontSize: '10px',
          letterSpacing: '0.1em',
          color: 'var(--casi-text-faint)',
        }}
      >
        {flash.time}
      </span>
      <span
        className="font-mono whitespace-nowrap"
        style={{
          fontSize: '10px',
          letterSpacing: '0.05em',
          padding: '3px 7px',
          borderRadius: '4px',
          background: chip.bg,
          color: chip.fg,
          border: `1px solid ${chip.border}`,
        }}
      >
        {flash.chip.label}
      </span>
      <div
        className="flex items-baseline gap-2 min-w-0"
        style={{ fontSize: '13px' }}
      >
        <span
          className="font-bold whitespace-nowrap"
          style={{ color: 'var(--casi-text)' }}
        >
          {flash.who}
        </span>
        <span className="truncate" style={{ color: 'var(--casi-text-dim)' }}>
          {flash.message}
        </span>
      </div>
    </div>
  );
}

export default function FlashesFeed({ flashes }: { flashes: Flash[] }) {
  return (
    <section
      className="flex flex-col"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '14px',
        maxHeight: '320px',
      }}
    >
      <header
        className="flex items-center justify-between"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--casi-border)',
          background:
            'linear-gradient(180deg, rgba(var(--casi-accent-rgb), 0.04), transparent)',
        }}
      >
        <span
          className="flex items-center gap-2 font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.2em',
            color: 'var(--casi-accent)',
          }}
        >
          <span aria-hidden style={{ fontSize: '14px' }}>
            ⚡
          </span>
          Flashes
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: '10px',
            letterSpacing: '0.14em',
            color: 'var(--casi-text-faint)',
          }}
        >
          <b style={{ color: 'var(--casi-text-dim)', fontWeight: 500 }}>{flashes.length}</b>{' '}
          / 50 · most recent first
        </span>
      </header>
      <div
        className="flex-1 overflow-y-auto flex flex-col gap-1"
        style={{ padding: '6px' }}
      >
        {flashes.map((flash) => (
          <FlashRow key={flash.id} flash={flash} />
        ))}
      </div>
    </section>
  );
}
