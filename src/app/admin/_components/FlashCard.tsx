import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';

// One row in the "Flash Messages" list. Keeps its own derived state
// (isFree / paid / isSolana) as locals so the admin page can keep the
// parent list logic to a map + a handful of handler props.
export default function FlashCard({ flash, settling, onApprove, onDeny }: {
  flash: any;
  settling: boolean;
  onApprove: (flash: any) => void;
  onDeny: (flash: any) => void;
}) {
  const isFree = flash.payment_method === 'free' || flash.amount_cents === 0;
  const paid = !!(flash.payment_intent_id || flash.tx_signature) || isFree;
  const isSolana = flash.payment_method === 'solana';
  const amountUsdc = isSolana ? (flash.amount_cents / 100).toFixed(2) : null;

  return (
    <div className="req-card c-flash">
      <div style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>⚡</div>
      <div className="req-info">
        <div className="req-meta">
          <span className="req-name">{flash.viewer_name}</span>
          {isFree
            ? <span className="tag t-green">🆓 Free</span>
            : paid
              ? <span className="tag t-green">✓ {isSolana ? 'Escrowed' : 'Paid'}</span>
              : <span className="tag t-dim">⌛ Awaiting payment</span>}
          {!isFree && (isSolana
            ? <span className="tag" style={{ background: 'rgba(153,69,255,0.12)', color: '#9945FF', border: '1px solid rgba(153,69,255,0.3)' }}>◎ {amountUsdc} USDC</span>
            : <span className="tag t-flash">${(flash.amount_cents / 100).toFixed(2)}</span>)}
          <span className="tag t-dim">{flash.payment_method}</span>
        </div>
        <div className="req-msg">"{flash.message}"</div>
        <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: '#333', marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{new Date(flash.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {paid && (
            <span style={{ color: '#4ade80' }}>
              {isSolana
                ? `◎ ${parseFloat(amountUsdc!).toFixed(2)} USDC → you · 100%`
                : `You receive $${(flash.amount_cents / 100).toFixed(2)} · 100%`}
            </span>
          )}
          {flash.tx_signature && (
            <a href={`https://solscan.io/tx/${flash.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
              style={{ color: '#9945FF', textDecoration: 'none', fontSize: 10 }}>
              ↗ Solscan
            </a>
          )}
        </div>
      </div>
      <div className="req-actions">
        <button onClick={() => onDeny(flash)} disabled={settling} className="act-btn"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', opacity: settling ? 0.5 : 1 }}>
          {isSolana && flash.escrow_pda ? '◎ Deny' : 'Deny'}
        </button>
        <button onClick={() => paid && onApprove(flash)} disabled={!paid || settling} className="act-btn"
          style={{ background: paid ? (isSolana ? '#9945FF' : '#facc15') : 'var(--casi-border)', color: paid ? (isSolana ? '#fff' : '#111') : '#444', cursor: paid && !settling ? 'pointer' : 'not-allowed', border: 'none', opacity: settling ? 0.7 : 1 }}>
          {settling ? '◎ Signing…' : paid ? (isSolana && flash.escrow_pda ? '◎ Approve' : '⚡ Approve') : 'Awaiting…'}
        </button>
      </div>
    </div>
  );
}
