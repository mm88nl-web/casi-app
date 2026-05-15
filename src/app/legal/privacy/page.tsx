export const metadata = { title: 'Privacy Policy — casi' };

export default function PrivacyPage() {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 32 }}>Last updated: 15 May 2026 · v1.0.</p>

      <h2 style={h2}>0. Controller</h2>
      <p>
        The controller of personal data processed through casi is{' '}
        <strong>Terminal Data Solutions</strong> (eenmanszaak, KvK 80519687), Spanjaardstraat 121 D,
        3025 TM Rotterdam, Netherlands. Contact for GDPR matters:{' '}
        <a href="mailto:privacy@casi.gg" style={a}>privacy@casi.gg</a>. See the{' '}
        <a href="/legal/imprint" style={a}>Imprint</a> for full operator details.
      </p>

      <h2 style={h2}>1. Data we collect</h2>
      <ul style={ul}>
        <li><strong>Streamers:</strong> email, display name, avatar, overlay slug, payout wallet address (if you connect Solana), and Stripe Connect account identifier (if you connect Stripe). The Stripe Connect account identifier is a reference — your bank details and KYC documents are held by Stripe, not by us.</li>
        <li><strong>Viewers:</strong> a display name you choose, the text and media you submit, and — if you tip — whatever Stripe or your Solana wallet discloses to us about the transaction (never your card number).</li>
        <li><strong>Wallet addresses:</strong> if you connect a Solana wallet, the public address. Public addresses are pseudonymous, not anonymous; on-chain activity tied to that address is public by nature of the blockchain.</li>
        <li><strong>Technical:</strong> IP address (hashed for abuse prevention and rate-limit enforcement), browser user-agent, timestamps, and structured error logs from your client.</li>
      </ul>

      <h2 style={h2}>2. Why we process it (lawful basis)</h2>
      <table style={tbl}>
        <tbody>
          <tr><th style={th}>Operating the overlay, processing bookings, displaying content</th><td style={td}>Performance of contract (GDPR Art. 6(1)(b))</td></tr>
          <tr><th style={th}>Card payments via Stripe / on-chain escrow on Solana</th><td style={td}>Performance of contract (GDPR Art. 6(1)(b))</td></tr>
          <tr><th style={th}>Authentication cookies, essential local storage</th><td style={td}>Strictly necessary, ePrivacy Art. 5(3)</td></tr>
          <tr><th style={th}>Rate limiting, captcha, content moderation</th><td style={td}>Legitimate interests (GDPR Art. 6(1)(f)) — fraud and abuse prevention</td></tr>
          <tr><th style={th}>Responding to abuse / DMCA / law enforcement requests</th><td style={td}>Legal obligation (GDPR Art. 6(1)(c))</td></tr>
        </tbody>
      </table>

      <h2 style={h2}>3. Third-party processors</h2>
      <ul style={ul}>
        <li><strong>Supabase</strong> — database, authentication, storage. Servers in the EU.</li>
        <li><strong>Stripe</strong> — card payments, payouts, and connected-account KYC. Stripe is the controller for the KYC data you submit to them; we never see it.</li>
        <li><strong>Vercel</strong> — hosting and edge functions. Some processing occurs in the United States; covered under EU–US Data Privacy Framework adequacy.</li>
        <li><strong>Helius</strong> — Solana RPC and webhook delivery for on-chain events.</li>
        <li><strong>Solana RPC providers</strong> — public-blockchain transactions (on-chain data is public by nature of the blockchain).</li>
      </ul>
      <p>Each processor receives only the minimum data needed to perform their function.</p>

      <h2 style={h2}>4. Cookies and local storage</h2>
      <p>
        We use essential cookies for authentication (Supabase session) and browser localStorage to
        remember your chosen Viewer name and theme preferences. We do not use advertising or third-party
        analytics cookies. Because we use only strictly-necessary cookies, no consent prompt is required
        under ePrivacy Art. 5(3); we still surface a notice on first visit.
      </p>

      <h2 style={h2}>5. Retention</h2>
      <ul style={ul}>
        <li>Account data: for as long as the account exists, plus a short grace period after deletion.</li>
        <li>Bookings and tips: retained for tax and legal-reporting purposes, typically 7 years (Dutch Algemene Wet inzake Rijksbelastingen, Art. 52).</li>
        <li>IP hashes for abuse prevention: up to 90 days.</li>
        <li>Uploaded images and videos: deleted automatically when the booking expires or is denied, and on request.</li>
        <li>Server logs: 30 days for routine logs, longer for security incidents.</li>
      </ul>

      <h2 style={h2}>6. Your rights (GDPR / UK GDPR)</h2>
      <p>
        If you are in the EU, UK, or EEA you have the rights to access (Art. 15), rectify (Art. 16),
        erase (Art. 17), restrict (Art. 18), port (Art. 20), and object to (Art. 21) processing of your
        personal data, and to withdraw consent where consent is the lawful basis. Email{' '}
        <a href="mailto:privacy@casi.gg" style={a}>privacy@casi.gg</a> with your request — we respond
        within 30 days as required by Art. 12(3).
      </p>
      <p>
        You also have the right to lodge a complaint with the Dutch supervisory authority,{' '}
        <strong>Autoriteit Persoonsgegevens</strong>:{' '}
        <a href="https://autoriteitpersoonsgegevens.nl" style={a} rel="noopener noreferrer" target="_blank">
          autoriteitpersoonsgegevens.nl
        </a>
        , or with the supervisory authority of your EU/EEA country of residence.
      </p>

      <h2 style={h2}>7. International transfers</h2>
      <p>
        Vercel processes data in the United States. Transfers to the US are covered under the EU–US Data
        Privacy Framework adequacy decision (European Commission Decision (EU) 2023/1795). Stripe
        operates globally; transfers outside the EEA are covered by Standard Contractual Clauses.
      </p>

      <h2 style={h2}>8. Children</h2>
      <p>The service is not intended for users under 18. We do not knowingly collect data from children. If you believe a child has submitted Content, email <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a> and we will remove it.</p>

      <h2 style={h2}>9. Security</h2>
      <p>We use TLS everywhere, hash passwords via Supabase Auth, keep service-role credentials server-side, and hash IP addresses before storing them. No system is perfectly secure; report vulnerabilities to <a href="mailto:security@casi.gg" style={a}>security@casi.gg</a>.</p>

      <h2 style={h2}>10. Changes</h2>
      <p>We may update this policy. Material changes will be announced via the site or email at least 30 days before they take effect.</p>

      <h2 style={h2}>11. Contact</h2>
      <p>Privacy questions: <a href="mailto:privacy@casi.gg" style={a}>privacy@casi.gg</a>. Operator details: <a href="/legal/imprint" style={a}>Imprint</a>.</p>
    </>
  );
}

const h2 = { fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8 } as const;
const ul = { paddingLeft: 22, marginBottom: 12 } as const;
const a  = { color: '#a78bfa', textDecoration: 'underline' } as const;
const tbl = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 16 } as const;
const th = { textAlign: 'left' as const, color: '#a1a1aa', fontWeight: 400, padding: '6px 12px 6px 0', verticalAlign: 'top' as const, width: 320 } as const;
const td = { padding: '6px 0', verticalAlign: 'top' as const } as const;
