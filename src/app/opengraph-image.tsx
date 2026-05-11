import { ImageResponse } from 'next/og';

/**
 * Dynamic Open Graph image for casi.gg.
 *
 * Renders to a 1200x630 PNG at /opengraph-image. Next.js auto-wires this
 * file as the default OG image for every page that doesn't override it,
 * and the same image is picked up by Twitter card consumers when no
 * separate twitter-image.tsx is provided.
 *
 * Brand mark inlined as SVG (mirror of components/v9/CasiMark.tsx) — the
 * @vercel/og runtime can't `import` arbitrary React components from the
 * app, so anything visual lives here directly. Colors hardcoded to the
 * default v9 ink/paper because per-streamer skins don't apply to the
 * top-level OG card.
 */

export const runtime = 'edge';
export const alt = 'casi — Rent a slot on your favourite streamer’s screen';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const ink = '#0DCFB0';
  const paper = '#0C0D11';
  const text = '#F0F2F5';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: paper,
          color: text,
          padding: '64px 80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* Dot grid in the background — same texture as the auth-page left
            panel and matches the v9 brand vocabulary. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle, rgba(13, 207, 176, 0.12) 1.5px, transparent 1.5px)',
            backgroundSize: '32px 32px',
            opacity: 0.5,
          }}
        />
        {/* Ink corner glow */}
        <div
          style={{
            position: 'absolute',
            bottom: -200,
            left: -200,
            width: 800,
            height: 800,
            background: `radial-gradient(circle, ${ink}1F 0%, transparent 65%)`,
          }}
        />

        {/* Header — mark + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, zIndex: 1 }}>
          <svg width="120" height="60" viewBox="0 0 400 200">
            <g stroke={ink} fill={ink} strokeWidth="16" strokeLinecap="round">
              <line x1="50" y1="60" x2="350" y2="60" />
              <line x1="20" y1="100" x2="380" y2="100" />
              <line x1="50" y1="140" x2="350" y2="140" />
            </g>
            <path
              fill={ink}
              d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z"
            />
            <circle fill={paper} cx="200" cy="100" r="45" />
          </svg>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: '-0.045em',
              color: text,
              display: 'flex',
            }}
          >
            casi<span style={{ color: ink }}>.</span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 108,
              fontWeight: 800,
              letterSpacing: '-0.045em',
              lineHeight: 0.92,
              color: text,
            }}
          >
            Your stream
          </div>
          <div
            style={{
              fontSize: 108,
              fontWeight: 800,
              letterSpacing: '-0.045em',
              lineHeight: 0.92,
              color: text,
              display: 'flex',
              alignItems: 'baseline',
            }}
          >
            is{' '}
            <span
              style={{
                color: ink,
                fontStyle: 'italic',
                marginLeft: 20,
              }}
            >
              real estate.
            </span>
          </div>

          {/* Subline */}
          <div
            style={{
              marginTop: 36,
              fontSize: 26,
              color: '#A0A4AA',
              fontFamily: 'system-ui',
            }}
          >
            Pay-per-minute streamer overlays · 0% Casi cut · Apache 2.0 on Solana
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
