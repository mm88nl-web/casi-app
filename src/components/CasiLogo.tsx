type Props = {
  size?: number;
  /** Overrides the almond+bars color. Defaults to --casi-accent. */
  color?: string;
  /** Color inside the pupil circle. Defaults to --casi-bg so it matches the page bg. */
  bgColor?: string;
  opacity?: number;
  className?: string;
};

export default function CasiLogo({
  size = 72,
  color = 'var(--casi-accent)',
  bgColor = 'var(--casi-bg)',
  opacity = 1,
  className,
}: Props) {
  const height = size * 0.5;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 200"
      width={size}
      height={height}
      className={className}
      style={{ opacity, display: 'block', flexShrink: 0 }}
      aria-hidden
    >
      <g stroke={color} fill={color} strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path
        fill={color}
        stroke="none"
        d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z"
      />
      <circle fill={bgColor} cx="200" cy="100" r="45" />
    </svg>
  );
}
