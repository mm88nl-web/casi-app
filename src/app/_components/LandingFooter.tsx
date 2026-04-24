import Link from 'next/link';
import CasiLogo from '@/components/CasiLogo';

const FOOTER_LINKS = [
  { href: '/legal/terms', label: 'Terms' },
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/aup', label: 'Acceptable use' },
  { href: '/legal/dmca', label: 'DMCA' },
];

export default function LandingFooter() {
  return (
    <footer
      className="flex flex-wrap items-center justify-between gap-4"
      style={{
        padding: '24px 32px',
        borderTop: '1px solid var(--casi-border)',
        color: 'var(--casi-text-mid)',
        fontSize: '12px',
      }}
    >
      <div className="flex items-center gap-2">
        <CasiLogo size={18} opacity={0.8} />
        <span>© 2026</span>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{ color: 'var(--casi-text-mid)', textDecoration: 'none' }}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
