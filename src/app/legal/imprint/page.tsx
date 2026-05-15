export const metadata = { title: 'Imprint — casi' };

export default function ImprintPage() {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Imprint</h1>
      <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 32 }}>
        Information required under the Dutch Handelsregisterwet and EU Directive 2000/31/EC (Article 5).
      </p>

      <h2 style={h2}>Operator</h2>
      <p>
        casi is operated by <strong>Terminal Data Solutions</strong>, a sole proprietorship (eenmanszaak)
        registered in the Netherlands.
      </p>

      <h2 style={h2}>Registration</h2>
      <table style={tbl}>
        <tbody>
          <tr><th style={th}>Trade name</th><td style={td}>Terminal Data Solutions</td></tr>
          <tr><th style={th}>Legal form</th><td style={td}>Eenmanszaak (sole proprietorship)</td></tr>
          <tr><th style={th}>KvK number</th><td style={td}>80519687</td></tr>
          <tr><th style={th}>Vestigingsnummer</th><td style={td}>000046870202</td></tr>
          <tr><th style={th}>VAT (BTW)</th><td style={td}>Not VAT-registered (small-business exemption, KOR)</td></tr>
          <tr><th style={th}>Responsible person</th><td style={td}>Matthew Melendez</td></tr>
        </tbody>
      </table>

      <h2 style={h2}>Address</h2>
      <p>
        Spanjaardstraat 121&nbsp;D<br />
        3025 TM Rotterdam<br />
        Netherlands
      </p>

      <h2 style={h2}>Contact</h2>
      <ul style={ul}>
        <li>General: <a href="mailto:info@terminaldatasolutions.com" style={a}>info@terminaldatasolutions.com</a></li>
        <li>Privacy / GDPR requests: <a href="mailto:privacy@casi.gg" style={a}>privacy@casi.gg</a></li>
        <li>Abuse / safety reports: <a href="mailto:abuse@casi.gg" style={a}>abuse@casi.gg</a></li>
        <li>Security disclosures: <a href="mailto:security@casi.gg" style={a}>security@casi.gg</a></li>
        <li>Legal notices: <a href="mailto:legal@casi.gg" style={a}>legal@casi.gg</a></li>
      </ul>

      <h2 style={h2}>Online dispute resolution</h2>
      <p>
        The European Commission provides a platform for online dispute resolution at{' '}
        <a href="https://ec.europa.eu/consumers/odr" style={a} rel="noopener noreferrer" target="_blank">
          ec.europa.eu/consumers/odr
        </a>
        . We are not obliged to participate in dispute resolution before a consumer arbitration board, but
        you may always contact us at the addresses above.
      </p>

      <h2 style={h2}>Supervisory authority</h2>
      <p>
        Data protection complaints may be lodged with the Dutch{' '}
        <strong>Autoriteit Persoonsgegevens</strong> (Dutch Data Protection Authority):{' '}
        <a href="https://autoriteitpersoonsgegevens.nl" style={a} rel="noopener noreferrer" target="_blank">
          autoriteitpersoonsgegevens.nl
        </a>
        .
      </p>

      <h2 style={h2}>Liability</h2>
      <p>
        Despite careful editing, we cannot guarantee the accuracy of every link or page. Liability for
        external content rests solely with the operator of that content. Streamers and Viewers are
        responsible for the content they publish through the casi platform; see the{' '}
        <a href="/legal/terms" style={a}>Terms of Service</a> and{' '}
        <a href="/legal/aup" style={a}>Acceptable Use Policy</a>.
      </p>
    </>
  );
}

const h2 = { fontSize: 18, fontWeight: 700, marginTop: 28, marginBottom: 8 } as const;
const ul = { paddingLeft: 22, marginBottom: 12 } as const;
const a  = { color: '#a78bfa', textDecoration: 'underline' } as const;
const tbl = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 16 } as const;
const th = { textAlign: 'left' as const, color: '#a1a1aa', fontWeight: 400, padding: '6px 0', verticalAlign: 'top' as const, width: 180 } as const;
const td = { padding: '6px 0', verticalAlign: 'top' as const } as const;
