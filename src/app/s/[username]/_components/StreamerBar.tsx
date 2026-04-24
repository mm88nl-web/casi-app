'use client';

type Props = {
  username: string;
  category: string;
  language: string;
  uptime: string;
  watching: number;
};

export default function StreamerBar({ username, category, language, uptime, watching }: Props) {
  return (
    <div
      className="flex items-center gap-3.5"
      style={{
        padding: '14px 18px',
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '14px',
      }}
    >
      <div
        aria-hidden
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background:
            'linear-gradient(135deg, var(--casi-accent2), var(--casi-accent))',
          flexShrink: 0,
        }}
      />
      <div className="flex-1 min-w-0">
        <div
          className="font-bold truncate"
          style={{ fontSize: '18px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
        >
          @{username}
        </div>
        <div
          className="font-mono uppercase truncate"
          style={{
            fontSize: '11px',
            letterSpacing: '0.14em',
            color: 'var(--casi-text-dim)',
            marginTop: '2px',
          }}
        >
          {category} · {language} · {uptime}
        </div>
      </div>
      <span
        className="font-mono uppercase inline-flex items-center gap-1.5"
        style={{
          fontSize: '12px',
          letterSpacing: '0.14em',
          color: 'var(--casi-accent2)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--casi-accent2)',
            boxShadow: '0 0 8px rgba(var(--casi-accent2-rgb), 0.7)',
          }}
        />
        {watching.toLocaleString()} watching
      </span>
    </div>
  );
}
