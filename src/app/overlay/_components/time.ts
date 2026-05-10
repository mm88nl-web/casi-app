export function getSecondsRemaining(booking: { started_at?: string | null; duration_minutes?: number | string | null } | null | undefined): number {
  if (!booking?.started_at || !booking?.duration_minutes) return 0;
  const started = new Date(booking.started_at).getTime();
  // Explicit Number() coercion: Postgres NUMERIC columns return as strings via PostgREST.
  const expiresAt = started + Number(booking.duration_minutes) * 60 * 1000;
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}

export function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
