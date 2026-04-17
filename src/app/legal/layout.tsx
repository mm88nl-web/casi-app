import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 20px 80px', fontFamily: "'Syne', ui-sans-serif, system-ui, sans-serif", color: '#e4e4e7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700&family=DM+Mono:wght@400;500&display=swap');`}</style>
      <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 36, paddingBottom: 16, borderBottom: '1px solid #27272a' }}>
        <Link href="/" style={{ color: '#71717a', textDecoration: 'none' }}>← casi</Link>
        <span style={{ flex: 1 }} />
        <Link href="/legal/terms"   style={{ color: '#e4e4e7', textDecoration: 'none' }}>Terms</Link>
        <Link href="/legal/privacy" style={{ color: '#e4e4e7', textDecoration: 'none' }}>Privacy</Link>
        <Link href="/legal/aup"     style={{ color: '#e4e4e7', textDecoration: 'none' }}>Acceptable Use</Link>
        <Link href="/legal/dmca"    style={{ color: '#e4e4e7', textDecoration: 'none' }}>DMCA / Report</Link>
      </nav>
      <article style={{ lineHeight: 1.6, fontSize: 15 }}>{children}</article>
    </div>
  );
}
