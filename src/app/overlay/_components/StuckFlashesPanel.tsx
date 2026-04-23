'use client';

type StuckFlash = {
  id: string;
  amount_cents: number;
  message?: string | null;
};

type Props = {
  flashes: StuckFlash[];
  reclaimingId: string | null;
  onReclaim: (flash: StuckFlash) => void | Promise<void>;
};

export default function StuckFlashesPanel({ flashes, reclaimingId, onReclaim }: Props) {
  if (!flashes.length) return null;

  return (
    <div style={{ marginTop: 24, background: 'rgba(192,132,252,0.05)', border: '1px solid rgba(192,132,252,0.2)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#c084fc' }}>
          ⚡ Your pending flashes
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--casi-text-muted)' }}>
          {flashes.length} unmoderated
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {flashes.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(192,132,252,0.15)' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: '#c084fc', background: 'rgba(192,132,252,0.1)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
              {(f.amount_cents / 100).toFixed(0)} USDC
            </span>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: 'var(--casi-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.message || '(no message)'}
            </span>
            <button
              onClick={() => onReclaim(f)}
              disabled={reclaimingId === f.id}
              style={{
                background: reclaimingId === f.id ? 'rgba(192,132,252,0.2)' : '#c084fc',
                color: reclaimingId === f.id ? '#c084fc' : 'var(--casi-bg)',
                border: 'none',
                borderRadius: 6,
                padding: '4px 10px',
                fontFamily: "'DM Mono', monospace",
                fontSize: 9,
                letterSpacing: 1,
                textTransform: 'uppercase',
                cursor: reclaimingId === f.id ? 'wait' : 'pointer',
                flexShrink: 0,
              }}
            >
              {reclaimingId === f.id ? '…' : 'Recover'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--casi-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
        Streamer hasn&apos;t moderated yet, OR the escrow already settled and the row didn&apos;t sync. Recover to refund your USDC + clear the row.
      </div>
    </div>
  );
}
