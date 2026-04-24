'use client';

import Link from 'next/link';
import CasiLogo from '@/components/CasiLogo';
import SearchDropdown from '@/components/SearchDropdown';

function Watermark({ side }: { side: 'left' | 'right' }) {
  const positioning =
    side === 'left'
      ? { left: '-80px', top: '-40px', transform: 'rotate(-8deg)' }
      : { right: '-60px', bottom: '-60px' };
  return (
    <div className="pointer-events-none absolute" style={positioning} aria-hidden>
      <CasiLogo
        size={520}
        color={side === 'left' ? 'var(--casi-accent2)' : 'var(--casi-accent)'}
        opacity={side === 'left' ? 0.035 : 0.04}
      />
    </div>
  );
}

function CornerLabel({ children }: { children: string }) {
  return (
    <span
      className="absolute font-mono uppercase"
      style={{
        top: '28px',
        right: '28px',
        fontSize: '11px',
        letterSpacing: '0.18em',
        color: 'var(--casi-text-faint)',
      }}
    >
      {children}
    </span>
  );
}

function Eyebrow({ children, tone }: { children: string; tone: 'accent' | 'cyan' }) {
  return (
    <div
      className="relative font-mono uppercase"
      style={{
        zIndex: 2,
        marginBottom: '28px',
        fontSize: '11px',
        letterSpacing: '0.2em',
        color: tone === 'accent' ? 'var(--casi-accent)' : 'var(--casi-accent2)',
      }}
    >
      {children}
    </div>
  );
}

export default function LandingSplitDoor() {
  return (
    <section
      className="grid"
      style={{
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        borderBottom: '1px solid var(--casi-border)',
        minHeight: 'calc(100vh - 111px)',
      }}
    >
      {/* WATCH */}
      <div
        className="relative flex flex-col justify-center overflow-hidden"
        style={{
          padding: '80px 64px',
          borderRight: '1px solid var(--casi-border)',
        }}
      >
        <Watermark side="left" />
        <CornerLabel>01 · Watch</CornerLabel>

        <Eyebrow tone="cyan">You&apos;re here to watch</Eyebrow>

        <h2
          className="relative font-extrabold"
          style={{
            zIndex: 2,
            fontSize: 'clamp(44px, 5vw, 72px)',
            lineHeight: 0.98,
            letterSpacing: '-3px',
            marginBottom: '22px',
          }}
        >
          Pick a <span style={{ color: 'var(--casi-accent2)' }}>live stream.</span>
          <br />
          Put yourself on it.
        </h2>

        <p
          className="relative max-w-[420px]"
          style={{
            zIndex: 2,
            fontSize: '17px',
            color: 'var(--casi-text-dim)',
            lineHeight: 1.6,
            marginBottom: '36px',
          }}
        >
          Type a streamer&apos;s name. Land on their stream. Pay to place your face, logo or message
          on screen for everyone to see.
        </p>

        <div className="relative" style={{ zIndex: 2 }}>
          <SearchDropdown />
        </div>

        <div
          className="relative font-mono uppercase"
          style={{
            zIndex: 2,
            marginTop: '18px',
            fontSize: '11px',
            letterSpacing: '0.14em',
            color: 'var(--casi-text-faint)',
          }}
        >
          Browse · no account needed
        </div>
      </div>

      {/* STREAM */}
      <div
        className="relative flex flex-col justify-center overflow-hidden"
        style={{ padding: '80px 64px' }}
      >
        <Watermark side="right" />
        <CornerLabel>02 · Stream</CornerLabel>

        <Eyebrow tone="accent">You&apos;re here to stream</Eyebrow>

        <h2
          className="relative font-extrabold"
          style={{
            zIndex: 2,
            fontSize: 'clamp(44px, 5vw, 72px)',
            lineHeight: 0.98,
            letterSpacing: '-3px',
            marginBottom: '22px',
          }}
        >
          Sell space on <span style={{ color: 'var(--casi-accent)' }}>your stream.</span>
        </h2>

        <p
          className="relative max-w-[420px]"
          style={{
            zIndex: 2,
            fontSize: '17px',
            color: 'var(--casi-text-dim)',
            lineHeight: 1.6,
            marginBottom: '44px',
          }}
        >
          Drop a browser source into OBS. Viewers pay to place images, clips or banners on your
          screen — by the minute, or per-flash. You approve. You keep 100%.
        </p>

        <div className="relative flex flex-wrap items-center gap-5" style={{ zIndex: 2 }}>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2.5 font-extrabold"
            style={{
              padding: '18px 28px',
              borderRadius: '10px',
              background: 'var(--casi-accent)',
              color: '#050505',
              fontFamily: 'var(--font-casi-sans)',
              fontSize: '17px',
              textDecoration: 'none',
              boxShadow: '0 12px 32px rgba(var(--casi-accent-rgb), 0.25)',
            }}
          >
            Create your studio <span style={{ fontSize: '20px' }}>→</span>
          </Link>
          <span
            className="font-mono uppercase"
            style={{
              fontSize: '11px',
              letterSpacing: '0.14em',
              color: 'var(--casi-text-faint)',
            }}
          >
            Free · 2 min setup
          </span>
        </div>
      </div>
    </section>
  );
}
