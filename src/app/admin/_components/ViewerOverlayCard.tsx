'use client';

type Props = {
  origin: string;
  username: string;
  copiedUrl: string | null;
  onCopy: (url: string, key: string) => void;
};

export default function ViewerOverlayCard({ origin, username, copiedUrl, onCopy }: Props) {
  const url = `${origin}/overlay?s=${username}`;
  return (
    <div className="set-card">
      <div className="set-title">Viewer overlay</div>
      <div className="set-sub">Share with your audience</div>
      <div className="code-row">
        <div className="code-box">{url}</div>
        <button onClick={() => onCopy(url, 'viewer')} className="btn-sm b-outline" style={{ border: '1px solid #222' }}>
          {copiedUrl === 'viewer' ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
