export const metadata = { title: 'Privacy Policy — casi' };

export default function PrivacyPage() {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 32 }}>Last updated: 17 April 2026 · Draft v0.1 — pending legal review.</p>

      <h2 style={h2}>1. Data we collect</h2>
      <ul style={ul}>
        <li><strong>Streamers:</strong> email, display name, avatar, overlay slug, payout wallet address (if you connect Solana), and Stripe Connect account identifier (if you connect Stripe).</li>
        <li><strong>Viewers:</strong> a display name you choose, the text and media you send, and — if you tip — whatever Stripe or your Solana wallet discloses to us about the transaction (never your card number).</li>
        <li><strong>Technical:</strong> IP address (hashed for abuse prevention and rate-limit enforcement), browser user-agent, and timestamps.</li>
      </ul>

      <h2 style={h2}>2. How we use it</h2>
      <ul style={ul}>
        <li>To operate the overlay, process bookings, and display Content to the Streamer.</li>
        <li>To process payments via Stripe (for EUR/card rails) or to construct on-chain escrow instructions (for Solana rails). We do not store payment card data.</li>
        <li>To prevent abuse: captcha verification, rate limiting, and content moderation.</li>
        <li>To respond to legal requests, DMCA notices, and abuse reports.</li>
      </ul>

      <h2 style={h2}>3. Third-party processors</h2>
      <ul style={ul}>
        <li><strong>Supabase</strong> — database, authentication, storage.</li>
        <li><strong>Stripe</strong> — card payments and payouts.</li>
        <li><strong>Cloudflare</strong> — CDN, DDoS protection, Turnstile captcha, email routing for abuse@casi.gg.</li>
        <li><strong>Solana RPC provider</strong> — public-blockchain transactions (on-chain data is public by nature).</li>
      </ul>
      <p>Each of these receives only the minimum data needed to perform their function.</p>

      <h2 style={h2}>4. Cookies and local storage</h2>
      <p>We use browser localStorage to remember your chosen Viewer name on a given Streamer&apos;s overlay. We use essential cookies for authentication. We do not use advertising or third-party analytics cookies.</p>

      <h2 style={h2}>5. Retention</h2>
      <ul style={ul}>
        <li>Account data: for as long as the account exists, plus a short grace period after deletion.</li>
        <li>Bookings and tips: retained for tax and legal-reporting purposes, typically 7 years.</li>
        <li>IP hashes for abuse prevention: up to 90 days.</li>
        <li>Uploaded images and videos: deleted automatically when the booking expires or is denied, and on request.</li>
      </ul>

      <h2 style={h2}>6. Your rights (GDPR / UK GDPR)</h2>
      <p>If you are in the EU or UK you have rights to access, correct, export, and delete your personal data, and to object to certain processing. Email <a href="mailto:privacy@casi.gg" style={a}>privacy@casi.gg</a> with your request and we will respond within 30 days.</p>

      <h2 style={h2}>7. Children</h2>
      <p>The service is not intended for users under 18. We do not knowingly collect data from children. If you believe a child has submitted Content, email <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a> and we will remove it.</p>

      <h2 style={h2}>8. Security</h2>
      <p>We use TLS everywhere, hash passwords via Supabase Auth, keep service-role credentials server-side, and hash IP addresses before storing them. No system is perfectly secure; report vulnerabilities to <a href="mailto:security@casi.gg" style={a}>security@casi.gg</a>.</p>

      <h2 style={h2}>9. Changes</h2>
      <p>We may update this policy. Material changes will be announced via the site or email.</p>

      <h2 style={h2}>10. Contact</h2>
      <p>Privacy questions: <a href="mailto:privacy@casi.gg" style={a}>privacy@casi.gg</a>. General contact: <a href="mailto:hello@casi.gg" style={a}>hello@casi.gg</a>.</p>
    </>
  );
}

const h2 = { fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8 } as const;
const ul = { paddingLeft: 22, marginBottom: 12 } as const;
const a  = { color: '#a78bfa', textDecoration: 'underline' } as const;
