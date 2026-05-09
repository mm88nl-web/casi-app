'use client';

type Props = {
  size?: number;
  /** Force a flat fill instead of the brand blue (#2775CA) — for cases where
   *  the icon needs to inherit the surrounding ink color. */
  mono?: string;
  className?: string;
  title?: string;
};

/**
 * USDC (Circle) mark. Blue ring with the stylized "$" cents glyph. This
 * is the well-known Circle USDC mark in flat form. Swap paths from
 * circle.com/usdc/brand if you want the pixel-canonical SVG.
 */
export default function UsdcIcon({ size = 14, mono, className, title = 'USDC' }: Props) {
  const fill = mono ?? '#2775CA';
  const inner = mono ? 'currentColor' : '#FFFFFF';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <circle cx="16" cy="16" r="16" fill={fill} />
      <path
        d="M20.5 18.5c0-2.4-1.4-3.2-4.3-3.6-2-.3-2.4-.8-2.4-1.8 0-.9.7-1.5 2-1.5 1.2 0 1.9.4 2.2 1.4.1.2.3.4.5.4h1.1c.3 0 .5-.2.5-.5v-.1c-.3-1.5-1.5-2.6-3-2.8V8.5c0-.3-.2-.5-.5-.5h-1c-.3 0-.5.2-.5.5V10c-2 .3-3.3 1.6-3.3 3.3 0 2.3 1.4 3.2 4.3 3.6 1.9.3 2.4.7 2.4 1.9 0 1.1-1 1.9-2.3 1.9-1.7 0-2.3-.7-2.5-1.6-.1-.3-.3-.4-.5-.4h-1.2c-.3 0-.5.2-.5.5v.1c.3 1.7 1.4 2.9 3.5 3.2v1.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5v-1.5c2.1-.3 3.5-1.7 3.5-3.5z"
        fill={inner}
      />
      <path
        d="M12.6 25.5c-5.3-1.9-8-7.7-6-12.9 1-2.8 3.2-4.9 6-6 .3-.1.4-.3.4-.6V5c0-.2-.1-.4-.4-.4 0 0-.1 0-.1 0-6.4 2-9.9 8.8-7.9 15.2 1.2 3.7 4.1 6.6 7.9 7.9.3.1.5 0 .5-.3v-1c0-.3-.2-.5-.4-.6zm6.8-21c-.3-.1-.5 0-.5.3v1c0 .3.2.5.4.6 5.3 1.9 8 7.7 6 12.9-1 2.8-3.2 4.9-6 6-.3.1-.4.3-.4.6V27c0 .2.1.4.4.4 0 0 .1 0 .2 0 6.4-2 9.9-8.8 7.9-15.2-1.3-3.8-4.2-6.7-8-7.9z"
        fill={inner}
      />
    </svg>
  );
}
