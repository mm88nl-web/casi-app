export const metadata = { title: 'Terms of Service — casi' };

export default function TermsPage() {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ color: 'var(--casi-text-muted)', fontSize: 13, marginBottom: 32 }}>Last updated: 15 May 2026 · v1.0.</p>

      <h2 style={h2}>1. Who we are</h2>
      <p>
        casi (&ldquo;casi&rdquo;, &ldquo;we&rdquo;) is operated by <strong>Terminal Data Solutions</strong>,
        an eenmanszaak registered in the Netherlands (KvK 80519687, Spanjaardstraat 121 D, 3025 TM
        Rotterdam). casi is a software platform where streamers (&ldquo;Streamers&rdquo;) publish a
        viewer-facing page that lets viewers (&ldquo;Viewers&rdquo;) send images, videos, and messages
        (&ldquo;Content&rdquo;) to appear on the Streamer&apos;s live overlay, optionally in exchange
        for a tip. See the <a href="/legal/imprint" style={a}>Imprint</a> for full operator details.
      </p>
      <p>
        casi does not hold, route, or process tip funds. Card tips flow directly viewer-to-Streamer via
        Stripe Connect; on-chain tips flow viewer-to-Streamer via our open-source escrow program on
        Solana. We are a software provider, not a payments institution.
      </p>

      <h2 style={h2}>2. Acceptance</h2>
      <p>By creating an account, sending a tip, or submitting Content, you agree to these Terms, the <a href="/legal/aup" style={a}>Acceptable Use Policy</a>, and the <a href="/legal/privacy" style={a}>Privacy Policy</a>. If you do not agree, do not use the service.</p>

      <h2 style={h2}>3. Accounts</h2>
      <p>You must be at least 18 years old to create a Streamer account. You are responsible for all activity under your account and for keeping your credentials secure.</p>

      <h2 style={h2}>4. Tips and payments</h2>
      <p>Tips are processed by Stripe (card rail) or executed by our open-source escrow program on Solana (USDC rail). casi does not take a platform fee on tips; Stripe fees and on-chain network fees apply as disclosed at checkout. Tips are paid directly to the Streamer&apos;s connected payout account. The Streamer&apos;s settlement currency is determined by their Stripe Connect account (typically the currency of their country of residence); Viewers are charged in that currency at checkout.</p>
      <p>Tips are <strong>non-refundable</strong> once captured or settled, except: (a) where refund is required by law, (b) where the Streamer has not delivered the agreed display (for example, the Streamer was offline or denied the booking), or (c) for on-chain tips, where the program&apos;s <code>cancel_escrow</code> or <code>cancel_stale_pending</code> instructions permit a refund. Refund decisions for captured card tips are at Stripe&apos;s and the Streamer&apos;s discretion; on-chain refunds are governed by the program&apos;s deterministic rules.</p>

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

      <h2 style={h2}>13. Governing law and jurisdiction</h2>
      <p>These Terms are governed by Dutch law. Any dispute arising from or relating to these Terms or the service is subject to the exclusive jurisdiction of the competent court in Rotterdam, Netherlands, except where mandatory consumer-protection law grants you the right to bring a claim in your country of residence.</p>

      <h2 style={h2}>14. Contact</h2>
      <p>Questions about these Terms: <a href="mailto:legal@casi.gg" style={a}>legal@casi.gg</a>. Abuse reports: <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a>. Operator details: <a href="/legal/imprint" style={a}>Imprint</a>.</p>
    </>
  );
}

const h2 = { fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8 } as const;
const a  = { color: 'var(--casi-accent)', textDecoration: 'underline' } as const;
