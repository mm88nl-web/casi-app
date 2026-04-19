import { useState } from 'react';

export default function BackdropModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (price: number, unit: string, maxDuration: number | null) => void;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(10);
  const [unit, setUnit] = useState('hr');
  const [maxDuration, setMaxDuration] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--casi-surface)', border: '1px solid #222', borderRadius: 16, padding: 32, width: '100%', maxWidth: 380 }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: 'var(--casi-text)', marginBottom: 6 }}>Full Backdrop</h2>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)', marginBottom: 24, lineHeight: 1.6 }}>Full-screen slot. Viewers send their image — you approve before it goes live.</p>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Price</span>
            <button type="button" onClick={() => setPrice(0)}
              style={{ background: price === 0 ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)', border: `1px solid ${price === 0 ? 'rgba(74,222,128,0.4)' : '#222'}`, borderRadius: 6, padding: '3px 10px', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: price === 0 ? '#4ade80' : 'var(--casi-text-muted)', cursor: 'pointer', transition: 'all .15s' }}>
              {price === 0 ? '★ Free slot' : '★ Make free'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: price === 0 ? '#4ade80' : 'var(--casi-accent)', fontWeight: 800 }}>$</span>
            <input type="number" min={0} value={price} onChange={(e) => setPrice(Math.max(0, parseInt(e.target.value) || 0))}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${price === 0 ? 'rgba(74,222,128,0.3)' : '#222'}`, borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--casi-text)', outline: 'none', fontFamily: "'Syne', sans-serif" }} autoFocus />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} disabled={price === 0}
              style={{ background: 'var(--casi-surface)', border: '1px solid #222', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--casi-text)', outline: 'none', cursor: price === 0 ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono', monospace", opacity: price === 0 ? 0.4 : 1 }}>
              <option value="min">/min</option>
              <option value="hr">/hr</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 8 }}>Max duration (minutes, optional)</div>
          <input type="number" min={1} value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder="No limit"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #222', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--casi-text)', outline: 'none', fontFamily: "'Syne', sans-serif" }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #222', borderRadius: 8, padding: 12, color: '#888', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onConfirm(price, unit, maxDuration ? parseInt(maxDuration) : null)}
            style={{ flex: 1, background: 'var(--casi-accent)', border: 'none', borderRadius: 8, padding: 12, color: 'var(--casi-bg)', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>Create Slot</button>
        </div>
      </div>
    </div>
  );
}
