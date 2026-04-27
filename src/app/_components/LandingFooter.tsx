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
      className="casi-l-foot flex flex-wrap items-center justify-between"
      style={{
        gap: '12px',
        padding: '18px 36px',
        borderTop: '1px solid var(--casi-border)',
        color: 'var(--casi-text-mid)',
        fontSize: '12px',
      }}
    >
      <style>{`
        .casi-l-foot-links a { color: var(--casi-text-mid); text-decoration: none; transition: color .15s; }
        .casi-l-foot-links a:hover { color: var(--casi-text); }
      `}</style>

      <div className="flex items-center" style={{ gap: '7px' }}>
        <CasiLogo size={28} color="var(--casi-text-mid)" opacity={0.4} />
        <span>© 2026</span>
      </div>
      <div className="casi-l-foot-links flex flex-wrap items-center" style={{ gap: '18px' }}>
        {FOOTER_LINKS.map(link => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
