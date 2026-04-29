'use client';

type Props = {
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  isLive: boolean;
};

/**
 * v7 venue-feel header. Full-width bar with a tall gradient background,
 * 72px rounded-square avatar, display headline + bio, and a status row
 * combining the live badge with an "↗ /overlay" link to the booking
 * surface.
 */
export default function StreamerBar({ username, displayName, avatarUrl, bio, isLive }: Props) {
  const initial = (displayName || username || '?').slice(0, 1).toUpperCase();

  return (
    <div
      className="flex items-center"
      style={{
        gap: '24px',
        padding: '28px 32px',
        background: 'linear-gradient(to bottom, var(--casi-surface-2), var(--casi-bg))',
        border: '1px solid var(--casi-border)',
        borderRadius: '14px',
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={`${displayName ?? username} avatar`}
          width={72}
          height={72}
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '16px',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          aria-hidden
          className="flex items-center justify-center"
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '16px',
            background:
              'linear-gradient(140deg, rgba(var(--casi-accent-rgb), 0.5), rgba(var(--casi-accent-rgb), 0.3))',
            color: 'var(--casi-bg)',
            fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
            fontWeight: 800,
            fontSize: '28px',
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="truncate"
          style={{
            fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
            fontWeight: 800,
            fontSize: '26px',
            letterSpacing: '-1px',
            marginBottom: '4px',
            color: 'var(--casi-text)',
          }}
        >
          {displayName || `@${username}`}
        </div>
        {bio ? (
          <div
            style={{
              fontSize: '13px',
              color: 'var(--casi-text-mid)',
              lineHeight: 1.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {bio}
          </div>
        ) : null}
        <div
          className="flex items-center"
          style={{ gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}
        >
          <span
            className="font-mono uppercase inline-flex items-center"
            style={{
              gap: '6px',
              padding: '5px 11px',
              borderRadius: '5px',
              background: isLive
                ? 'rgba(var(--casi-accent-rgb), 0.09)'
                : 'transparent',
              border: `1px solid ${isLive ? 'rgba(var(--casi-accent-rgb), 0.22)' : 'var(--casi-border-2)'}`,
              fontSize: '9.5px',
              letterSpacing: '0.14em',
              color: isLive ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
            }}
          >
            <span
              aria-hidden
              className="casi-vb-dot"
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isLive ? 'var(--casi-accent)' : 'var(--casi-text-faint)',
              }}
            />
            {isLive ? 'Live now' : 'Offline'}
            {isLive ? (
              <style>{`
                .casi-vb-dot { animation: casi-vb-blink 2s ease-in-out infinite; }
                @keyframes casi-vb-blink {
                  0%, 100% { opacity: 1; }
                  50%       { opacity: 0.25; }
                }
              `}</style>
            ) : null}
          </span>
          <a
            href={`/overlay?s=${username}`}
            className="font-mono uppercase"
            style={{
              fontSize: '9.5px',
              letterSpacing: '0.12em',
              color: 'var(--casi-text-dim)',
              textDecoration: 'none',
              transition: 'color .14s',
            }}
          >
            ↗ www.casi.gg/overlay?s={username}
          </a>
        </div>
      </div>
    </div>
  );
}
