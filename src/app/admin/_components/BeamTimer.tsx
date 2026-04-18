import { useEffect, useState } from 'react';
import { formatTime, getSecondsRemaining } from './time';

export default function BeamTimer({
  booking,
  onExpire,
}: {
  booking: any;
  onExpire: (b: any) => void;
}) {
  const [seconds, setSeconds] = useState(getSecondsRemaining(booking));
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getSecondsRemaining(booking);
      setSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire(booking);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [booking, onExpire]);
  const isWarning = seconds <= 120 && seconds > 0;
  const isExpired = seconds <= 0;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontFamily: "'DM Mono', monospace",
        fontWeight: 500,
        background: isExpired
          ? 'rgba(239,68,68,0.12)'
          : isWarning
          ? 'rgba(234,179,8,0.12)'
          : 'rgba(var(--casi-accent2-rgb),0.10)',
        color: isExpired ? '#f87171' : isWarning ? '#facc15' : 'var(--casi-accent2)',
        border: `1px solid ${
          isExpired
            ? 'rgba(239,68,68,0.3)'
            : isWarning
            ? 'rgba(234,179,8,0.3)'
            : 'rgba(var(--casi-accent2-rgb),0.2)'
        }`,
        animation: isWarning ? 'pulse 1.5s infinite' : 'none',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'currentColor',
          flexShrink: 0,
        }}
      />
      {isExpired ? 'Expired' : formatTime(seconds)}
    </span>
  );
}
