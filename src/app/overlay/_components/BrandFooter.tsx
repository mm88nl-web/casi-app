import SolanaIcon from '@/components/icons/SolanaIcon';

export default function BrandFooter() {
  return (
    <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid var(--line, var(--casi-surface))', textAlign: 'center' }}>
      <a
        href="/search"
        style={{
          fontFamily: 'var(--M), var(--font-casi-mono), monospace',
          fontSize: 10,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: 'var(--text-3)',
          textDecoration: 'none',
        }}
      >
        Browse other streams →
      </a>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
        <span
          style={{
            fontFamily: 'var(--M), var(--font-casi-mono), monospace',
            fontSize: 9,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: 'var(--text-4)',
          }}
        >
          Powered by
        </span>
        <SolanaIcon size={11} />
        <span
          style={{
            fontFamily: 'var(--M), var(--font-casi-mono), monospace',
            fontSize: 9,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: 'var(--text-4)',
          }}
        >
          Solana
        </span>
      </div>
    </div>
  );
}
