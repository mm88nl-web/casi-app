'use client';

import { useEffect, useRef, useState } from 'react';
import { getSecondsRemaining, formatTime } from './time';

type Props = {
  booking: { started_at?: string | null; duration_minutes?: number | string | null } | null | undefined;
  onWarning?: (s: number) => void;
  onExpire?: () => void;
};

export default function Countdown({ booking, onWarning, onExpire }: Props) {
  const [seconds, setSeconds] = useState(getSecondsRemaining(booking));
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const interval = setInterval(() => {
      const s = getSecondsRemaining(booking);
      setSeconds(s);
      if (onWarning) onWarning(s);
      if (s <= 0 && onExpire && !firedRef.current) {
        firedRef.current = true;
        onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [booking, onWarning, onExpire]);

  return <span>{formatTime(seconds)}</span>;
}
