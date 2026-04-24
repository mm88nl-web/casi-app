/**
 * Official Solana brandmark — three horizontal bars with the purple→green→
 * teal gradient. Same artwork admin's inline SVGs and the v3 handoff use,
 * extracted into a reusable component so we only carry one copy.
 *
 * Sizing: pass `size` for the box width. The logo's natural aspect ratio is
 * ~1.28:1 (397×311 viewBox). The height scales automatically.
 */
type Props = {
  size?: number;
  /** CSS opacity, for watermark / muted use. Defaults to 1. */
  opacity?: number;
  /** Override for containers that need a specific pixel aspect — e.g.
   *  rendering into a 40×40 avatar tile. When set, forces a square
   *  viewBox by centering the bars; otherwise the native 1.28:1 AR wins. */
  square?: boolean;
  className?: string;
  title?: string;
};

export default function SolanaLogo({ size = 24, opacity = 1, square, className, title }: Props) {
  const width = size;
  const height = square ? size : Math.round(size * 311 / 397);
  const viewBox = square ? '0 0 400 400' : '0 0 397 311';
  // When square, centre-shift the 397×311 artwork inside a 400×400 box.
  const transform = square ? 'translate(1.5, 44.5)' : undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={width}
      height={height}
      className={className}
      style={{ opacity, display: 'block', flexShrink: 0 }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="casi-solana-gradient" x1="0" y1="0" x2="397" y2="311" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="0.5" stopColor="#14F195" />
          <stop offset="1" stopColor="#00FFA3" />
        </linearGradient>
      </defs>
      <g transform={transform} fill="url(#casi-solana-gradient)">
        {/* Bottom bar */}
        <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8H387c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H10c-5.8 0-8.7-7-4.6-11.1l59.2-62.7z" />
        {/* Top bar */}
        <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0H387c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H10c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" />
        {/* Middle bar */}
        <path d="M329.4 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H10c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8H387c5.8 0 8.7-7 4.6-11.1l-62.2-62.7z" />
      </g>
    </svg>
  );
}
