export const metadata = { title: 'Terms of Service — casi' };

export default function TermsPage() {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 32 }}>Last updated: 17 April 2026 · Draft v0.1 — pending legal review.</p>

      <h2 style={h2}>1. Who we are</h2>
      <p>casi (&ldquo;casi&rdquo;, &ldquo;we&rdquo;) operates a platform where streamers (&ldquo;Streamers&rdquo;) publish a viewer-facing page that lets viewers (&ldquo;Viewers&rdquo;) send images, videos, and messages (&ldquo;Content&rdquo;) to appear on the Streamer&apos;s live overlay, optionally in exchange for a tip.</p>

      <h2 style={h2}>2. Acceptance</h2>
      <p>By creating an account, sending a tip, or submitting Content, you agree to these Terms, the <a href="/legal/aup" style={a}>Acceptable Use Policy</a>, and the <a href="/legal/privacy" style={a}>Privacy Policy</a>. If you do not agree, do not use the service.</p>

      <h2 style={h2}>3. Accounts</h2>
      <p>You must be at least 18 years old to create a Streamer account. You are responsible for all activity under your account and for keeping your credentials secure.</p>

      <h2 style={h2}>4. Tips and payments</h2>
      <p>Tips are processed by Stripe or, where enabled, on the Solana blockchain via our escrow program. casi does not take a platform fee on tips; Stripe fees and on-chain network fees apply as disclosed at checkout. Tips are paid directly to the Streamer&apos;s connected payout account.</p>
      <p>Tips are <strong>non-refundable</strong> once captured, except where refund is required by law or where the Streamer has not delivered the agreed display (for example, the Streamer was offline or denied the booking). Refund decisions for paid tips are at Stripe&apos;s and the Streamer&apos;s discretion.</p>

      <h2 style={h2}>5. User content</h2>
      <p>You retain ownership of Content you submit. By submitting, you grant casi and the receiving Streamer a worldwide, non-exclusive, royalty-free licence to display, transmit, cache, and moderate the Content for the purpose of operating the service.</p>
      <p>You represent that you own or have the rights to submit the Content, that it does not infringe third-party rights, and that it complies with the Acceptable Use Policy.</p>

      <h2 style={h2}>6. Moderation and removal</h2>
      <p>We may remove Content, suspend accounts, or block access at any time — with or without notice — for violations of these Terms or the Acceptable Use Policy, for legal reasons, or to protect the service and its users. Streamers may also approve, deny, or remove bookings on their own overlay at their discretion.</p>

      <h2 style={h2}>7. Prohibited activity</h2>
      <p>See the <a href="/legal/aup" style={a}>Acceptable Use Policy</a> for the full list. In short: no illegal content, no CSAM, no non-consensual intimate imagery, no harassment, no doxxing, no copyright infringement, no malware, no platform abuse.</p>

      <h2 style={h2}>8. DMCA / copyright</h2>
      <p>We respond to valid copyright notices under the DMCA and equivalent EU and UK regimes. See <a href="/legal/dmca" style={a}>DMCA / Report</a> for the submission procedure.</p>

      <h2 style={h2}>9. Disclaimers</h2>
      <p>The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or implied, to the maximum extent permitted by law.</p>

      <h2 style={h2}>10. Limitation of liability</h2>
      <p>To the maximum extent permitted by law, casi&apos;s aggregate liability to you for any claim arising out of or relating to the service is limited to the greater of (a) the fees casi received from you in the 12 months preceding the claim, or (b) €100. We are not liable for indirect, consequential, or incidental damages.</p>

      <h2 style={h2}>11. Termination</h2>
      <p>You may stop using the service at any time. We may suspend or terminate your access at any time for breach of these Terms, legal reasons, or risk to the service.</p>

      <h2 style={h2}>12. Changes</h2>
      <p>We may update these Terms. Material changes will be announced via the site or email. Continued use after changes take effect constitutes acceptance.</p>

      <h2 style={h2}>13. Contact</h2>
      <p>Questions about these Terms: <a href="mailto:legal@casi.gg" style={a}>legal@casi.gg</a>. Abuse reports: <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a>.</p>
    </>
  );
}

const h2 = { fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8 } as const;
const a  = { color: '#a78bfa', textDecoration: 'underline' } as const;
