'use client';

type Props = {
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  isLive: boolean;
};

export default function StreamerBar({ username, displayName, avatarUrl, bio, isLive }: Props) {
  const initial = (displayName || username || '?').slice(0, 1).toUpperCase();

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
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={`${displayName ?? username} avatar`}
          width={44}
          height={44}
          style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          aria-hidden
          className="flex items-center justify-center font-extrabold"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--casi-accent2), var(--casi-accent))',
            color: '#0a0a0a',
            fontSize: '18px',
            fontFamily: 'var(--font-casi-sans)',
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className="font-bold truncate"
          style={{ fontSize: '18px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
        >
          {displayName || `@${username}`}
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
          @{username}
          {bio ? <> · <span style={{ textTransform: 'none', letterSpacing: '0.02em' }}>{bio.slice(0, 80)}</span></> : null}
        </div>
      </div>
      <span
        className="font-mono uppercase inline-flex items-center gap-1.5"
        style={{
          fontSize: '11px',
          letterSpacing: '0.14em',
          color: isLive ? 'var(--casi-accent2)' : 'var(--casi-text-dim)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isLive ? 'var(--casi-accent2)' : 'var(--casi-text-faint)',
            boxShadow: isLive ? '0 0 8px rgba(var(--casi-accent2-rgb), 0.7)' : 'none',
          }}
        />
        {isLive ? 'Live now' : 'Offline'}
      </span>
    </div>
  );
}
