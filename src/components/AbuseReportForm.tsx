'use client';

import { useCallback, useState } from 'react';
import TurnstileWidget from '@/components/TurnstileWidget';

type Kind = 'dmca' | 'illegal' | 'harassment' | 'other';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'dmca',       label: 'DMCA / copyright' },
  { value: 'illegal',    label: 'Illegal content' },
  { value: 'harassment', label: 'Harassment / threats' },
  { value: 'other',      label: 'Other AUP violation' },
];

export default function AbuseReportForm() {
  const [kind,          setKind]           = useState<Kind>('dmca');
  const [reporterEmail, setReporterEmail]  = useState('');
  const [reporterName,  setReporterName]   = useState('');
  const [targetUrl,     setTargetUrl]      = useState('');
  const [targetUser,    setTargetUser]     = useState('');
  const [description,   setDescription]    = useState('');
  const [token,         setToken]          = useState<string | null>(null);
  const [submitting,    setSubmitting]     = useState(false);
  const [done,          setDone]           = useState(false);
  const [error,         setError]          = useState<string | null>(null);

  const onVerify = useCallback((t: string) => setToken(t), []);
  const onExpire = useCallback(() => setToken(null), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) { setError('Please complete the captcha'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/abuse/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          reporter_email: reporterEmail,
          reporter_name:  reporterName || null,
          target_url:     targetUrl || null,
          target_username: targetUser || null,
          description,
          turnstile_token: token,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        setError(j?.error || 'Failed to submit report');
      } else {
        setDone(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ color: '#86efac', fontSize: 15 }}>
        <strong>Report received.</strong> Thank you — we review reports in the order received and will follow up to the email you provided if we need more information.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: '#a1a1aa', fontFamily: "var(--font-casi-mono), monospace", letterSpacing: 1, textTransform: 'uppercase' }}>File a report</div>

      <label style={lbl}>
        Type of report
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} style={inp}>
          {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={lbl}>
          Your email<span style={req}> *</span>
          <input type="email" required value={reporterEmail} onChange={(e) => setReporterEmail(e.target.value)} style={inp} placeholder="you@example.com" />
        </label>
        <label style={lbl}>
          Your name
          <input type="text" value={reporterName} onChange={(e) => setReporterName(e.target.value)} style={inp} placeholder="Optional" />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={lbl}>
          Target URL
          <input type="url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} style={inp} placeholder="https://casi.gg/s/..." />
        </label>
        <label style={lbl}>
          Target username
          <input type="text" value={targetUser} onChange={(e) => setTargetUser(e.target.value)} style={inp} placeholder="Streamer handle" />
        </label>
      </div>

      <label style={lbl}>
        Description<span style={req}> *</span>
        <textarea required value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inp, minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }} placeholder="What should we look at? Include timestamps, URLs, and — for DMCA — the copyrighted work and your statement under penalty of perjury." maxLength={4000} />
      </label>

      <TurnstileWidget onVerify={onVerify} onExpire={onExpire} theme="dark" />

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      <button
        type="submit"
        disabled={submitting || !token}
        style={{
          padding: '12px 20px',
          background: '#a78bfa',
          color: '#09090b',
          border: 'none',
          borderRadius: 8,
          fontFamily: "var(--font-casi-mono), monospace",
          fontWeight: 500,
          fontSize: 13,
          letterSpacing: 1,
          textTransform: 'uppercase',
          cursor: (submitting || !token) ? 'not-allowed' : 'pointer',
          opacity: (submitting || !token) ? 0.5 : 1,
          alignSelf: 'flex-start',
        }}
      >
        {submitting ? 'Submitting…' : 'Submit report'}
      </button>
    </form>
  );
}

const lbl = { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 13, color: '#e4e4e7' };
const inp = { padding: '10px 12px', background: '#18181b', border: '1px solid #27272a', borderRadius: 8, color: '#e4e4e7', fontSize: 14 } as const;
const req = { color: '#f87171' } as const;
