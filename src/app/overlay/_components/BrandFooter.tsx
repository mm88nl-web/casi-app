import SolanaIcon from '@/components/icons/SolanaIcon';

export default function BrandFooter() {
  return (
    <footer
      style={{
        marginTop: 48,
        padding: '14px 0',
        borderTop: '1px solid var(--line, rgba(255,255,255,0.06))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--M), var(--font-casi-mono), monospace',
          fontSize: 9,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--text-4, rgba(255,255,255,0.18))',
        }}
      >
        casi.
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontFamily: 'var(--M), var(--font-casi-mono), monospace',
            fontSize: 9,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-4, rgba(255,255,255,0.18))',
          }}
        >
          crypto on
        </span>
        <SolanaIcon size={10} />
        <span
          style={{
            fontFamily: 'var(--M), var(--font-casi-mono), monospace',
            fontSize: 9,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-4, rgba(255,255,255,0.18))',
          }}
        >
          Solana
        </span>
      </div>
    </footer>
  );
}
