import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 20px 80px', fontFamily: "var(--font-casi-sans), ui-sans-serif, system-ui, sans-serif", color: 'var(--casi-text)' }}>
      <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: "var(--font-casi-mono), monospace", fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 36, paddingBottom: 16, borderBottom: '1px solid var(--casi-border)' }}>
        <Link href="/" style={{ color: 'var(--casi-text-muted)', textDecoration: 'none' }}>← casi</Link>
        <span style={{ flex: 1 }} />
        <Link href="/legal/terms"   style={{ color: 'var(--casi-text)', textDecoration: 'none' }}>Terms</Link>
        <Link href="/legal/privacy" style={{ color: 'var(--casi-text)', textDecoration: 'none' }}>Privacy</Link>
        <Link href="/legal/aup"     style={{ color: 'var(--casi-text)', textDecoration: 'none' }}>Acceptable Use</Link>
        <Link href="/legal/dmca"    style={{ color: 'var(--casi-text)', textDecoration: 'none' }}>DMCA / Report</Link>
        <Link href="/legal/imprint" style={{ color: 'var(--casi-text)', textDecoration: 'none' }}>Imprint</Link>
      </nav>
      <article style={{ lineHeight: 1.6, fontSize: 15 }}>{children}</article>
    </div>
  );
}
