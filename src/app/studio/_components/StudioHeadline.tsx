'use client';

type Props = {
  username: string;
  viewers: number;
  isLive: boolean;
};

export default function StudioHeadline({ username, viewers, isLive }: Props) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <h1
          className="font-extrabold"
          style={{
            fontSize: '30px',
            letterSpacing: '-1.2px',
            lineHeight: 1.05,
            color: 'var(--casi-text)',
          }}
        >
          Welcome back, <span style={{ color: 'var(--casi-accent)' }}>@{username}</span>
        </h1>
        <p
          className="mt-1"
          style={{ fontSize: '14px', color: 'var(--casi-text-dim)' }}
        >
          Your stream. Your slots. Your rates. One page.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {isLive ? (
          <span
            className="inline-flex items-center gap-2 font-mono uppercase"
            style={{
              padding: '10px 16px',
              borderRadius: '999px',
              background: 'rgba(var(--casi-accent2-rgb), 0.1)',
              border: '1px solid rgba(var(--casi-accent2-rgb), 0.3)',
              fontSize: '11px',
              letterSpacing: '0.15em',
              color: 'var(--casi-accent2)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--casi-accent2)',
                boxShadow: '0 0 8px rgba(var(--casi-accent2-rgb), 0.7)',
              }}
            />
            Live · {viewers.toLocaleString()} viewers
          </span>
        ) : (
          <span
            className="font-mono uppercase"
            style={{
              padding: '10px 16px',
              borderRadius: '999px',
              background: 'var(--casi-surface)',
              border: '1px solid var(--casi-border)',
              fontSize: '11px',
              letterSpacing: '0.15em',
              color: 'var(--casi-text-dim)',
            }}
          >
            Offline
          </span>
        )}
        <button
          type="button"
          className="font-mono uppercase transition-colors"
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid var(--casi-border-2)',
            background: 'transparent',
            color: 'var(--casi-text-dim)',
            fontSize: '11px',
            letterSpacing: '0.15em',
            cursor: 'pointer',
          }}
        >
          End stream ⏹
        </button>
      </div>
    </header>
  );
}
