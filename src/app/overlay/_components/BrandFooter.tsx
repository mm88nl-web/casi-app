import SolanaIcon from '@/components/icons/SolanaIcon';

export default function BrandFooter() {
  return (
    <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid var(--line, var(--casi-surface))', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
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
