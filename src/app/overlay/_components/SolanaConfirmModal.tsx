'use client';

import { EXPLORER_CLUSTER_QUERY, IS_MAINNET } from '@/lib/solana-network';
import { formatTime } from './time';

export type TxStatus = 'idle' | 'booking' | 'streaming' | 'waiting' | 'error';

type Props = {
  slot: { price_value: number | string; price_unit: string };
  duration: number;
  estimatedCost: string;
  username: string;
  recipientWallet: string | null;
  usdcBalance: number | null;
  txStatus: TxStatus;
  txError: string | null;
  txId: string | null;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function SolanaConfirmModal({
  slot, duration, estimatedCost, username, recipientWallet, usdcBalance,
  txStatus, txError, txId, submitting, onConfirm, onCancel,
}: Props) {
  const hasInsufficient = usdcBalance !== null && usdcBalance < parseFloat(estimatedCost);
  const inProgress = submitting && txStatus !== 'idle' && txStatus !== 'error';
  const stepIcon = (active: boolean, done: boolean) => (done ? '✓' : active ? '⟳' : '○');
  const shortWallet = recipientWallet
    ? `${recipientWallet.slice(0, 4)}…${recipientWallet.slice(-4)}`
    : null;
  const solscanUrl = txId
    ? `https://solscan.io/tx/${txId}${EXPLORER_CLUSTER_QUERY}`
    : null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"var(--font-casi-mono),monospace" }}>
      <div style={{ background:'var(--casi-surface,#0d0d0d)', border:'1px solid rgba(153,69,255,0.35)', borderRadius:16, padding:28, width:'100%', maxWidth:380 }}>
        <div style={{ fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#9945FF', marginBottom:16 }}>Confirm your beam slot</div>

        {/* Details receipt */}
        <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
          {[['Slot on', `@${username}${IS_MAINNET ? '' : ' (devnet)'}`], ['Duration', formatTime(Math.round(duration * 60))], ['Rate', `$${slot.price_value}/${slot.price_unit}`]].map(([l, v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#666', marginBottom:6 }}>
              <span>{l}</span><span style={{ color:'#e8e8e8' }}>{v}</span>
            </div>
          ))}
          {shortWallet && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#666', marginBottom:6 }}>
              <span>Recipient</span>
              <span style={{ color:'#e8e8e8', fontFamily:"var(--font-casi-mono),monospace" }}>{shortWallet}</span>
            </div>
          )}
          <div style={{ borderTop:'1px solid #1c1c1c', margin:'10px 0' }} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#555', marginBottom:8 }}>
            <span>@{username} receives</span>
            <span style={{ color:'#e8e8e8' }}>{parseFloat(estimatedCost).toFixed(2)} USDC <span style={{ color:'#6ee7b7' }}>(100%)</span></span>
          </div>
          <div style={{ borderTop:'1px solid #1a1a1a', margin:'6px 0 8px' }} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#666' }}>
            <span>Total</span>
            <span style={{ fontSize:18, fontWeight:800, color:'#9945FF' }}>{estimatedCost} USDC</span>
          </div>
          {usdcBalance !== null && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:8 }}>
              <span style={{ color:'#555' }}>Your balance</span>
              <span style={{ color: hasInsufficient ? '#f87171' : '#6ee7b7' }}>
                {usdcBalance.toFixed(2)} USDC{hasInsufficient ? ' — insufficient' : ''}
              </span>
            </div>
          )}
        </div>

        {/* CASI escrow note + anti-phishing warning */}
        {!inProgress && txStatus !== 'waiting' && (
          <div style={{ fontSize:10, color:'#444', lineHeight:1.8, marginBottom:16 }}>
            Funds held in CASI on-chain escrow and vest over the beam duration.<br />
            Unused USDC returns if ended early.
            {shortWallet && (
              <>
                <br />
                <span style={{ color:'#facc15' }}>⚠ Verify recipient </span>
                <span style={{ color:'#666' }}>{shortWallet}</span>
                <span style={{ color:'#facc15' }}> in your wallet popup.</span>
              </>
            )}
          </div>
        )}

        {/* TX status steps */}
        {(inProgress || txStatus === 'waiting') && (
          <div style={{ background:'rgba(255,255,255,0.02)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
            {[
              { label: 'Booking created',             active: txStatus === 'booking',   done: txStatus !== 'booking' },
              { label: 'Funding CASI escrow…',        active: txStatus === 'streaming', done: txStatus === 'waiting' },
              { label: 'Waiting for admin approval',  active: txStatus === 'waiting',   done: false },
            ].map((step, i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:10, fontSize:11,
                color: step.done ? '#6ee7b7' : step.active ? '#9945FF' : '#444',
                marginBottom: i < 2 ? 8 : 0,
              }}>
                <span style={{ width:14, textAlign:'center', display:'inline-block', animation: step.active ? 'casi-blink 1.2s infinite' : 'none' }}>
                  {stepIcon(step.active, step.done)}
                </span>
                {step.label}
                {step.active && i === 2 && solscanUrl && (
                  <a href={solscanUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft:'auto', fontSize:10, color:'#9945FF', textDecoration:'none', opacity:0.8 }}>
                    ↗ verify tx
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {txStatus === 'error' && txError && (
          <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:11, color:'#f87171' }}>
            {txError}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:'flex', gap:10 }}>
          <button
            onClick={onCancel}
            disabled={inProgress}
            style={{ flex:1, background:'none', border:'1px solid #1c1c1c', borderRadius:10, padding:'12px 0', fontFamily:"var(--font-casi-sans),sans-serif", fontWeight:700, fontSize:13, color: inProgress ? '#333' : '#555', cursor: inProgress ? 'not-allowed' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={inProgress || hasInsufficient}
            style={{ flex:2, background: inProgress || hasInsufficient ? '#1c1c1c' : '#9945FF', border:'none', borderRadius:10, padding:'12px 0', fontFamily:"var(--font-casi-sans),sans-serif", fontWeight:800, fontSize:13, color: inProgress || hasInsufficient ? '#444' : '#fff', cursor: inProgress || hasInsufficient ? 'not-allowed' : 'pointer' }}
          >
            {inProgress ? 'Signing…' : txStatus === 'error' ? 'Retry →' : 'Confirm & Sign →'}
          </button>
        </div>
      </div>
    </div>
  );
}
