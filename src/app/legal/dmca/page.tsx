import AbuseReportForm from '@/components/AbuseReportForm';

export const metadata = { title: 'DMCA / Report — casi' };

export default function DmcaPage() {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>DMCA & abuse reports</h1>
      <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 32 }}>Last updated: 17 April 2026 · Draft v0.1 — pending legal review.</p>

      <h2 style={h2}>Emergency reports</h2>
      <p>If you are reporting <strong>child sexual abuse material (CSAM)</strong> or <strong>imminent threats of harm to a person</strong>, email <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a> with the word <code style={code}>URGENT</code> in the subject. We also urge you to report directly to local law enforcement and, in the US, to the <a href="https://www.missingkids.org/gethelpnow/cybertipline" style={a} target="_blank" rel="noopener noreferrer">NCMEC CyberTipline</a>.</p>

      <h2 style={h2}>DMCA takedown notices</h2>
      <p>Copyright owners and their authorised agents may submit a takedown notice using the form below or by email to <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a>. Your notice must include all of the following under penalty of perjury:</p>
      <ol style={ol}>
        <li>Your physical or electronic signature and contact information.</li>
        <li>Identification of the copyrighted work claimed to have been infringed.</li>
        <li>Identification of the allegedly infringing material and its location on casi (URL).</li>
        <li>A statement that you have a good-faith belief that the use is not authorised by the copyright owner, its agent, or the law.</li>
        <li>A statement that the information in the notification is accurate, and under penalty of perjury that you are authorised to act on behalf of the copyright owner.</li>
      </ol>
      <p>We will review valid notices promptly, remove or disable the material, notify the uploader, and give them the opportunity to file a counter-notice.</p>

      <h2 style={h2}>Counter-notices</h2>
      <p>If your Content was removed and you believe the removal was mistaken or covered by fair use, email <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a> with your counter-notice including (a) your contact info, (b) identification of the removed material, (c) a statement under penalty of perjury that you have a good-faith belief the removal was a mistake, and (d) consent to jurisdiction.</p>

      <h2 style={h2}>Repeat infringers</h2>
      <p>We terminate accounts of users who are the subject of repeated, valid copyright notices.</p>

      <h2 style={h2}>Other reports</h2>
      <p>For illegal content, harassment, impersonation, or other violations of the <a href="/legal/aup" style={a}>Acceptable Use Policy</a>, use the form below. Include as much detail as possible — screenshots and URLs help us act quickly.</p>

      <div style={{ marginTop: 24, padding: 20, border: '1px solid #27272a', borderRadius: 12, background: '#0f0f13' }}>
        <AbuseReportForm />
      </div>
    </>
  );
}

const h2 = { fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8 } as const;
const ol = { paddingLeft: 22, marginBottom: 12 } as const;
const a  = { color: '#a78bfa', textDecoration: 'underline' } as const;
const code = { background: '#27272a', padding: '2px 6px', borderRadius: 4, fontSize: 13 } as const;
