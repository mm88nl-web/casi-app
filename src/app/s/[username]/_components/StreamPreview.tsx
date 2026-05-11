'use client';

/**
 * Illustrative scene preview for the streamer's public landing page.
 *
 * Replaces the previous fake-activity mockup ("CoolTiger42 is beaming!",
 * "rina_42: yoooo") which read as real on-stream activity even when the
 * streamer was offline — same credibility issue as the fabricated stats
 * on the landing page. Now strictly a diagram: one labeled "your beam"
 * slot and one labeled "taken" slot, both clearly marked as illustrative,
 * no invented usernames or chat.
 */
export default function StreamPreview() {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        aspectRatio: '16/9',
        background: '#0a0a0a',
        border: '1px solid var(--casi-border)',
        borderRadius: '14px',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 80% at 50% 100%, rgba(var(--casi-accent2-rgb), 0.08), transparent 55%), radial-gradient(80% 60% at 0% 0%, rgba(var(--casi-accent-rgb), 0.08), transparent 60%)',
        }}
      />

      <span
        className="absolute font-mono uppercase"
        style={{
          top: '12px',
          left: '12px',
          zIndex: 5,
          fontSize: '9px',
          letterSpacing: '0.18em',
          background: 'rgba(0,0,0,0.6)',
          color: 'var(--casi-text-dim)',
          padding: '4px 9px',
          borderRadius: '4px',
          border: '1px solid var(--casi-border-2)',
        }}
      >
        Illustrative · slot layout
      </span>

      {/* Available beam slot — the one a viewer can book */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          top: '14%',
          left: '6%',
          width: '26%',
          height: '36%',
          borderRadius: '8px',
          background:
            'linear-gradient(135deg, rgba(var(--casi-accent-rgb), 0.18), rgba(var(--casi-accent-rgb), 0.04))',
          border: '2px dashed rgba(var(--casi-accent-rgb), 0.5)',
          color: 'var(--casi-accent)',
          gap: '6px',
        }}
      >
        <span className="font-bold" style={{ fontSize: '12px', letterSpacing: '-0.1px' }}>
          Your beam here
        </span>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '9px',
            letterSpacing: '0.16em',
            color: 'var(--casi-accent)',
          }}
        >
          Streamer sets price
        </span>
      </div>

      {/* Generic occupied slot — no fake username, just shows the layout */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          top: '14%',
          right: '6%',
          width: '26%',
          height: '36%',
          borderRadius: '8px',
          background: 'rgba(var(--casi-accent2-rgb), 0.08)',
          border: '1px solid rgba(var(--casi-accent2-rgb), 0.3)',
          gap: '6px',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            background: 'rgba(var(--casi-accent2-rgb), 0.18)',
            border: '1px solid rgba(var(--casi-accent2-rgb), 0.35)',
          }}
        />
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '9px',
            letterSpacing: '0.16em',
            color: 'var(--casi-text-dim)',
          }}
        >
          Booked
        </span>
      </div>

      {/* Banner placement at the bottom — premium full-width surface */}
      <div
        className="absolute flex items-center"
        style={{
          left: '6%',
          right: '6%',
          bottom: '10%',
          height: '14%',
          borderRadius: '6px',
          background: 'rgba(var(--casi-accent-rgb), 0.06)',
          border: '1px dashed rgba(var(--casi-accent-rgb), 0.3)',
          paddingLeft: '14px',
          paddingRight: '14px',
          gap: '10px',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'rgba(var(--casi-accent-rgb), 0.5)',
          }}
        />
        <span
          className="font-mono uppercase"
          style={{
            flex: 1,
            fontSize: '10px',
            letterSpacing: '0.18em',
            color: 'var(--casi-text-dim)',
          }}
        >
          Banner · full-width placement
        </span>
      </div>
    </div>
  );
}
