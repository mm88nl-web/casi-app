export const metadata = { title: 'Acceptable Use Policy — casi' };

export default function AupPage() {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Acceptable Use Policy</h1>
      <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 32 }}>Last updated: 17 April 2026 · Draft v0.1 — pending legal review.</p>

      <p>This policy applies to everyone who uses casi — streamers, viewers, and tippers. Violations can result in Content removal, account suspension, loss of funds held in pending state, and referral to law enforcement where required by law.</p>

      <h2 style={h2}>Absolutely prohibited</h2>
      <ul style={ul}>
        <li><strong>CSAM.</strong> Any sexualised depiction of a minor, real or generated. Reported immediately to the authorities and, where applicable, NCMEC.</li>
        <li><strong>Non-consensual intimate imagery.</strong> Including &ldquo;deepfakes&rdquo;, revenge porn, or upskirt/voyeur material.</li>
        <li><strong>Terrorism, extremist recruitment, or incitement to violence.</strong></li>
        <li><strong>Doxxing</strong> — sharing another person&apos;s private information (real name, address, phone, documents) without their consent.</li>
        <li><strong>Threats</strong> of violence, death, or sexual assault against any person.</li>
        <li><strong>Malware, phishing, or exploit payloads.</strong></li>
        <li><strong>Illegal goods and services.</strong> Drugs, weapons, counterfeit documents, stolen accounts, hacking services.</li>
      </ul>

      <h2 style={h2}>Not allowed</h2>
      <ul style={ul}>
        <li>Harassment, hate speech, or targeted abuse on the basis of race, religion, gender, sexual orientation, disability, or similar characteristics.</li>
        <li>Copyright or trademark infringement. Submit only Content you own or have the right to share.</li>
        <li>Deceptive impersonation of real people, brands, or public figures.</li>
        <li>Explicit sexual content — casi is not an adult platform at this time.</li>
        <li>Scams, pyramid schemes, unlicensed financial services, fake charities.</li>
        <li>Attempts to bypass safety measures: captcha solvers, rate-limit evasion, sockpuppet accounts, automated submission of Content without explicit permission from the receiving Streamer.</li>
        <li>Attempts to attack or disrupt the service: DDoS, credential stuffing, exploitation of vulnerabilities beyond good-faith security research.</li>
      </ul>

      <h2 style={h2}>Streamer responsibilities</h2>
      <p>Streamers are responsible for what appears on their own overlay. If you enable a free tier, you accept that you will review incoming bookings and either approve or deny them. You must remove violating Content promptly and may be held responsible for keeping it visible.</p>

      <h2 style={h2}>Reporting</h2>
      <p>Suspected violations: <a href="/legal/dmca" style={a}>file a report</a> or email <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a>. We review reports in the order received and respond faster to time-sensitive categories (CSAM, imminent harm).</p>

      <h2 style={h2}>Good-faith security research</h2>
      <p>We welcome responsible vulnerability disclosure. Email <a href="mailto:security@casi.gg" style={a}>security@casi.gg</a> with details and allow reasonable time for a fix before publishing. Do not access other users&apos; data beyond what is needed to demonstrate the issue, and do not execute denial-of-service tests against production.</p>
    </>
  );
}

const h2 = { fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8 } as const;
const ul = { paddingLeft: 22, marginBottom: 12 } as const;
const a  = { color: '#a78bfa', textDecoration: 'underline' } as const;
