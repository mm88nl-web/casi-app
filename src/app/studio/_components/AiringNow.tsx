'use client';

export type AiringItem = {
  id: string;
  icon: string;
  name: string;
  subtitle: string;
  /** Countdown for timed items (beams). Flashes and other untimed items omit this. */
  remaining?: string;
};

type Props = {
  items: AiringItem[];
};

export default function AiringNow({ items }: Props) {
  return (
    <section
      className="flex flex-col gap-3"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '18px',
        padding: '18px',
      }}
    >
      <header
        className="flex items-center justify-between font-bold"
        style={{ fontSize: '15px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
      >
        <span>Airing now</span>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            padding: '3px 10px',
            borderRadius: '999px',
            background: 'rgba(var(--casi-accent2-rgb), 0.1)',
            color: 'var(--casi-accent2)',
            border: '1px solid rgba(var(--casi-accent2-rgb), 0.25)',
            fontWeight: 500,
          }}
        >
          {items.length} live
        </span>
      </header>

      {items.map((item) => (
        <div
          key={item.id}
          className="grid items-center gap-2.5"
          style={{
            gridTemplateColumns: '36px 1fr auto',
            padding: '10px 12px',
            background: 'var(--casi-bg)',
            border: '1px solid var(--casi-border-2)',
            borderRadius: '10px',
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background:
                'linear-gradient(135deg, rgba(var(--casi-accent2-rgb), 0.3), rgba(var(--casi-accent-rgb), 0.2))',
              fontSize: '16px',
            }}
            aria-hidden
          >
            {item.icon}
          </div>
          <div>
            <div
              className="font-semibold truncate"
              style={{ fontSize: '13px', color: 'var(--casi-text)' }}
            >
              {item.name}
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
              {item.subtitle}
            </div>
          </div>
          {item.remaining ? (
            <div
              className="font-mono font-medium"
              style={{ fontSize: '14px', color: 'var(--casi-accent2)' }}
            >
              {item.remaining}
            </div>
          ) : (
            <div
              className="font-mono uppercase"
              style={{
                fontSize: '10px',
                letterSpacing: '0.15em',
                color: 'var(--casi-accent2)',
              }}
            >
              on stream
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
