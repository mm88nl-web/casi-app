'use client';

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
      {/* subtle scene backdrop so the box isn't flat */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 80% at 50% 100%, rgba(var(--casi-accent2-rgb), 0.08), transparent 55%), radial-gradient(80% 60% at 0% 0%, rgba(var(--casi-accent-rgb), 0.08), transparent 60%)',
        }}
      />

      {/* hint pill */}
      <span
        className="absolute font-mono uppercase"
        style={{
          top: '12px',
          right: '12px',
          zIndex: 5,
          fontSize: '10px',
          letterSpacing: '0.16em',
          background: 'rgba(0,0,0,0.6)',
          color: 'var(--casi-text-mid)',
          padding: '5px 10px',
          borderRadius: '999px',
          border: '1px solid var(--casi-border-2)',
        }}
      >
        Preview · your spot shown live
      </span>

      {/* Your beam slot (available) */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          top: '8%',
          left: '5%',
          width: '22%',
          height: '28%',
          borderRadius: '6px',
          background:
            'linear-gradient(135deg, rgba(var(--casi-accent-rgb), 0.18), rgba(var(--casi-accent-rgb), 0.04))',
          border: '2px dashed rgba(var(--casi-accent-rgb), 0.45)',
          color: 'var(--casi-accent)',
        }}
      >
        <span
          className="font-bold"
          style={{ fontSize: '11px', letterSpacing: '-0.1px' }}
        >
          Your beam here
        </span>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '9px',
            letterSpacing: '0.16em',
            color: 'var(--casi-accent)',
            marginTop: '4px',
          }}
        >
          €5/min
        </span>
      </div>

      {/* Taken slot (occupied by another viewer) */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{
          top: '8%',
          right: '5%',
          width: '22%',
          height: '28%',
          borderRadius: '6px',
          background: 'rgba(var(--casi-accent2-rgb), 0.12)',
          border: '1px solid rgba(var(--casi-accent2-rgb), 0.4)',
        }}
      >
        <span style={{ fontSize: '22px' }} aria-hidden>
          🔥
        </span>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '9px',
            letterSpacing: '0.14em',
            color: 'var(--casi-accent2)',
            marginTop: '4px',
          }}
        >
          ● CoolTiger42
        </span>
      </div>

      {/* Mock chat lines */}
      <div
        className="absolute flex flex-col gap-0.5"
        style={{
          left: '12px',
          bottom: '12px',
          fontSize: '11px',
          color: 'var(--casi-text-mid)',
        }}
      >
        <div>
          <span style={{ color: 'var(--casi-accent)', marginRight: '6px' }}>rina_42</span>
          yoooo
        </div>
        <div>
          <span style={{ color: 'var(--casi-accent2)', marginRight: '6px' }}>m_r</span>
          sick setup
        </div>
      </div>
    </div>
  );
}
