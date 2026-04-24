import Link from 'next/link';

/**
 * Minimal site footer — rendered on marketing / auth / legal surfaces.
 * Not rendered on /overlay/* (OBS embed) or /admin (in-app chrome).
 */
export default function SiteFooter() {
  return (
    <footer
      style={{
        marginTop: 'auto',
        padding: '28px 20px 36px',
        borderTop: '1px solid #27272a',
        fontFamily: "var(--font-casi-mono), ui-monospace, monospace",
        fontSize: 11,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: '#71717a',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 18,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <span>© {new Date().getFullYear()} casi</span>
      <Link href="/legal/terms"   style={link}>Terms</Link>
      <Link href="/legal/privacy" style={link}>Privacy</Link>
      <Link href="/legal/aup"     style={link}>Acceptable Use</Link>
      <Link href="/legal/dmca"    style={link}>DMCA · Report</Link>
      <a href="mailto:abuse@casi.gg" style={link}>abuse@casi.gg</a>
    </footer>
  );
}

const link = { color: '#a1a1aa', textDecoration: 'none' } as const;
