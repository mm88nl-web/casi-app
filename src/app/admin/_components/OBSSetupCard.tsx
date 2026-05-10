'use client';

type Props = {
  origin: string;
  username: string;
  copiedUrl: string | null;
  onCopy: (url: string, key: string) => void;
};

const SOURCE_ROWS: Array<[string, string, string, string]> = [
  ['TOP', 'Casi Beams', '#06b6d4', 'floating overlay, transparent bg'],
  ['MID', 'Your Camera', '#444', 'with chroma key / bg removal'],
  ['BTM', 'Casi Backdrop', '#c084fc', 'full screen, transparent bg'],
];

const LAYER_ROWS: Array<[string, string, string]> = [
  ['beams', '#06b6d4', 'Beams URL'],
  ['backdrop', '#c084fc', 'Backdrop URL'],
];

export default function OBSSetupCard({ origin, username, copiedUrl, onCopy }: Props) {
  return (
    <div className="set-card">
      <div className="set-title">OBS Setup</div>
      <div className="set-sub">Add two browser sources in OBS in this order</div>

      <div style={{ marginBottom: 16, borderRadius: 10, border: '1px solid #161616', overflow: 'hidden' }}>
        {SOURCE_ROWS.map(([pos, name, color, desc]) => (
          <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #0d0d0d', background: 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color, background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 4, padding: '2px 7px', letterSpacing: 1, flexShrink: 0 }}>{pos}</span>
            <span style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 600, fontSize: 13, color: 'var(--casi-text)' }}>{name}</span>
            <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: '#444', marginLeft: 'auto' }}>{desc}</span>
          </div>
        ))}
      </div>

      {LAYER_ROWS.map(([layer, color, label]) => {
        const url = `${origin}/obs?s=${username}&layer=${layer}`;
        return (
          <div key={layer} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#444', marginBottom: 6 }}>{label}</div>
            <div className="code-row">
              <div className="code-box" style={{ borderColor: `${color}20`, color }}>{url}</div>
              <button
                onClick={() => onCopy(url, layer)}
                className="btn-sm"
                style={{ background: `${color}15`, color, border: `1px solid ${color}30`, fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
              >
                {copiedUrl === layer ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        );
      })}

      <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #111', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
        <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: '#444', marginBottom: 4 }}>Custom CSS for both sources:</div>
        <code style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>{'body { background-color: rgba(0,0,0,0); }'}</code>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #111', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Dimensions</div>
          <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>1920 × 1080</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #111', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Not updating?</div>
          <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>Right-click source → Refresh cache</div>
        </div>
      </div>
    </div>
  );
}
