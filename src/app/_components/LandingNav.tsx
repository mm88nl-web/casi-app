import Link from 'next/link';
import CasiLogo from '@/components/CasiLogo';

type Props = {
  liveCount: number;
};

export default function LandingNav({ liveCount }: Props) {
  return (
    <nav
      className="flex items-center justify-between"
      style={{ padding: '18px 32px', borderBottom: '1px solid var(--casi-border)' }}
    >
      <Link
        href="/"
        className="flex items-center gap-2"
        style={{ color: 'var(--casi-text)', textDecoration: 'none' }}
      >
        <CasiLogo size={72} />
        <span
          className="font-extrabold"
          style={{
            fontFamily: 'var(--font-casi-sans)',
            fontSize: '22px',
            letterSpacing: '-1px',
          }}
        >
          casi
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <span
          className="inline-flex items-center gap-2 font-mono uppercase"
          style={{
            padding: '6px 12px',
            borderRadius: '999px',
            background: 'rgba(var(--casi-accent2-rgb), 0.08)',
            border: '1px solid rgba(var(--casi-accent2-rgb), 0.3)',
            color: 'var(--casi-accent2)',
            fontSize: '11px',
            letterSpacing: '0.14em',
          }}
        >
          <span
            aria-hidden
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--casi-accent2)',
              boxShadow: '0 0 8px rgba(var(--casi-accent2-rgb), 0.7)',
            }}
          />
          {liveCount} live now
        </span>
      </div>
    </nav>
  );
}
