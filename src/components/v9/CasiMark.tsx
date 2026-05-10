type Props = {
  width?: number;
  height?: number;
  className?: string;
};

export function CasiMark({ width = 58, height = 29, className = 'casi-v9-mark' }: Props) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 200"
      width={width}
      height={height}
      aria-hidden="true"
    >
      <g stroke="currentColor" fill="currentColor" strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path
        fill="currentColor"
        stroke="none"
        d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z"
      />
      <circle fill="var(--paper)" cx="200" cy="100" r="45" />
    </svg>
  );
}
