'use client';

type Props = {
  elementsCount: number;
  isLive: boolean;
  onAddBeam: () => void;
  onGoToSettings: () => void;
  onDismiss: () => void;
};

export default function OnboardingBanner({
  elementsCount,
  isLive,
  onAddBeam,
  onGoToSettings,
  onDismiss,
}: Props) {
  const steps = [
    {
      num: '01',
      color: 'var(--casi-accent)',
      title: 'Add a beam slot',
      body: 'Hit + Beam above to add a slot to your canvas. Drag it where you want it on screen, then set a price.',
      action: (
        <button
          onClick={onAddBeam}
          style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--casi-accent)', border: 'none', borderRadius: 6, padding: '7px 14px', color: 'var(--casi-bg)', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: 0.3 }}
        >
          + Add beam
        </button>
      ),
    },
    {
      num: '02',
      color: '#06b6d4',
      title: 'Add OBS browser source',
      body: 'In OBS, add a Browser Source. Paste your overlay URL from Settings. Set background to transparent.',
      action: (
        <button
          onClick={onGoToSettings}
          style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(var(--casi-accent2-rgb),0.1)', border: '1px solid rgba(var(--casi-accent2-rgb),0.25)', borderRadius: 6, padding: '7px 14px', color: 'var(--casi-accent2)', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: 0.3 }}
        >
          Get URL →
        </button>
      ),
    },
    {
      num: '03',
      color: '#4ade80',
      title: 'Go live and share',
      body: 'Hit Go Live, copy your viewer link, and share it in your stream chat. Viewers can now tip to display their image or video in your slots.',
      action: (
        <span style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#333', letterSpacing: 0.5 }}>
          Use the Go Live button above ↑
        </span>
      ),
    },
  ];

  const progress = [elementsCount > 0, false, isLive];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(var(--casi-accent-rgb),0.07) 0%, rgba(var(--casi-accent2-rgb),0.05) 100%)',
      borderBottom: '1px solid rgba(var(--casi-accent-rgb),0.15)',
      padding: 0,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-accent)' }}>
            ✦ Quick&nbsp;setup
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#333' }}>— 3 steps to go live</span>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, padding: '4px 8px', borderRadius: 4, transition: 'color .2s' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#888')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#333')}
        >
          Dismiss ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '8px 24px 4px', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>
        <span><span style={{ color: '#facc15' }}>⚡ Flash</span> = one-shot popup message</span>
        <span><span style={{ color: 'var(--casi-accent2)' }}>✦ Beam</span> = timed image/video in a slot</span>
        <span><span style={{ color: '#c084fc' }}>🖼 Backdrop</span> = full-screen takeover</span>
      </div>

      <div className="banner-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, padding: '12px 24px 20px' }}>
        {steps.map((step, i) => (
          <div key={step.num} style={{ padding: '16px 20px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: step.color, background: `${step.color}22`, border: `1px solid ${step.color}40`, borderRadius: 4, padding: '2px 6px' }}>{step.num}</span>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--casi-text)' }}>{step.title}</span>
            </div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, lineHeight: 1.6, color: 'var(--casi-text-muted)', flex: 1 }}>{step.body}</p>
            {step.action}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 24px 14px' }}>
        {progress.map((done, i) => (
          <div key={i} style={{ height: 2, flex: 1, borderRadius: 1, background: done ? 'var(--casi-accent)' : 'var(--casi-border)', transition: 'background .4s' }} />
        ))}
      </div>
    </div>
  );
}
