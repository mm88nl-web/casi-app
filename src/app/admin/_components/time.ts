export function getSecondsRemaining(booking: any): number {
  if (!booking?.started_at || !booking?.duration_minutes) return 0;
  const started = new Date(booking.started_at).getTime();
  // Explicit Number() coercion: Postgres NUMERIC columns return as strings via PostgREST
  const expiresAt = started + Number(booking.duration_minutes) * 60 * 1000;
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}

export function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtDuration(minutes: number): string {
  const secs = Math.round(minutes * 60);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
