'use client';

type Props = {
  size?: number;
  /** Force a flat fill instead of the brand violet (#635BFF) — for cases
   *  where the icon needs to inherit the surrounding ink color. */
  mono?: string;
  /** When true, render the "stripe" wordmark instead of the S badge. The
   *  wordmark is wider and looks better in payout / branding surfaces. */
  wordmark?: boolean;
  className?: string;
  title?: string;
};

/**
 * Stripe mark. Default: the rounded "S" badge in violet (#635BFF). With
 * `wordmark`, renders the "stripe" lockup. Swap paths from
 * stripe.com/newsroom/brand-assets for the pixel-canonical SVGs.
 */
export default function StripeIcon({ size = 14, mono, wordmark, className, title = 'Stripe' }: Props) {
  const fill = mono ?? '#635BFF';

  if (wordmark) {
    return (
      <svg
        width={size * (60 / 14)}
        height={size}
        viewBox="0 0 60 25"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={title}
        className={className}
      >
        <path
          d="M59.5 12.4c0-4.3-2.1-7.6-6-7.6-4 0-6.4 3.4-6.4 7.6 0 5 2.8 7.5 6.9 7.5 2 0 3.5-.5 4.7-1.1v-3.3c-1.2.6-2.5 1-4.2 1-1.7 0-3.1-.6-3.3-2.6h8.4l-.1-1.5zm-8.5-1.6c0-1.9 1.2-2.7 2.2-2.7 1.1 0 2.1.8 2.1 2.7h-4.3zm-10.9-6c-1.6 0-2.7.8-3.3 1.3l-.2-1H33v19.7l4.1-.9V19c.6.4 1.5 1 3 1 3 0 5.7-2.4 5.7-7.6 0-4.8-2.7-7.6-5.7-7.6zm-1 11.7c-1 0-1.6-.4-2-.8V9.3c.5-.5 1.1-.9 2-.9 1.6 0 2.7 1.8 2.7 4.5 0 2.7-1.1 4.6-2.7 4.6zm-12.2-12.3l4.1-.9V0l-4.1.9v3.3zM27 5.1h4.1v14.6H27V5.1zm-4.4 1.2L22.4 5.1h-3.5v14.6H23v-9.9c1-1.3 2.6-1 3.1-.9V5.1c-.5-.2-2.4-.5-3.5 1.2zm-8.2-4.8L10.4 2.4v13.8c0 2.5 1.9 4.4 4.4 4.4 1.4 0 2.4-.3 3-.6v-3.3c-.5.2-3.1 1-3.1-1.5V8.6h3.1V5.1h-3.1l-.3-3.6zM4.1 9.3c0-.6.5-.8 1.4-.8 1.2 0 2.7.4 4 1V5.7c-1.4-.5-2.7-.8-4-.8-3.3 0-5.5 1.7-5.5 4.6 0 4.5 6.2 3.8 6.2 5.7 0 .7-.6.9-1.6.9-1.4 0-3.1-.5-4.5-1.2v3.9c1.5.7 3.1 1 4.5 1 3.4 0 5.8-1.7 5.8-4.6-.1-4.9-6.3-4.1-6.3-5.9z"
          fill={fill}
        />
      </svg>
    );
  }

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
      <rect width="32" height="32" rx="6" fill={fill} />
      <path
        d="M14.7 12.4c0-.6.5-.8 1.4-.8 1.2 0 2.8.4 4 1.1v-3.8c-1.3-.5-2.7-.8-4-.8-3.3 0-5.5 1.7-5.5 4.6 0 4.5 6.2 3.8 6.2 5.7 0 .7-.6.9-1.6.9-1.4 0-3.1-.6-4.5-1.4v3.9c1.5.7 3.1 1 4.5 1 3.4 0 5.7-1.7 5.7-4.6.1-4.9-6.2-4.1-6.2-5.8z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
