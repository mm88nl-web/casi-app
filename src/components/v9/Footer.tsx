import Link from 'next/link';

export function Footer() {
  return (
    <footer className="casi-v9-foot">
      <div>© {new Date().getFullYear()} · CASI</div>
      <div className="casi-v9-foot-links">
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/aup">Acceptable use</Link>
        <Link href="/legal/dmca">DMCA</Link>
      </div>
    </footer>
  );
}
