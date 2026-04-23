export default function BrandFooter() {
  return (
    <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid var(--casi-surface)', textAlign: 'center' }}>
      <a
        href="/search"
        style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#222', textDecoration: 'none' }}
      >
        Browse other streams →
      </a>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#888' }}>Powered by</span>
        <svg width="14" height="14" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sf-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9945FF" />
              <stop offset="100%" stopColor="#6E3FD4" />
            </linearGradient>
          </defs>
          <path d="M15 30 Q50 10 85 30 Q50 50 15 30Z" fill="url(#sf-grad)" />
          <path d="M15 50 Q50 30 85 50 Q50 70 15 50Z" fill="url(#sf-grad)" opacity="0.75" />
          <path d="M15 70 Q50 50 85 70 Q50 90 15 70Z" fill="url(#sf-grad)" opacity="0.5" />
        </svg>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#888' }}>Solana</span>
      </div>
    </div>
  );
}
