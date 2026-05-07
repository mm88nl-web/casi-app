'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type FlashRow = {
  id: string;
  viewer_name: string | null;
  message: string | null;
  payment_method: string | null;
  price_value: number | string | null;
  price_unit: string | null;
  created_at: string;
};

type Props = {
  supabase: SupabaseClient;
  profileId: string;
  /** Default 6. Tune from caller if a screen needs a longer list. */
  limit?: number;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatAmount(row: FlashRow): { label: string; rail: 'u' | 'e' } {
  const n = Number(row.price_value || 0);
  const rail = row.payment_method === 'solana' ? 'u' : 'e';
  if (rail === 'u') return { label: `${n} USDC`, rail };
  // Stripe price_unit can be 'eur' | 'usd' depending on the streamer's account.
  const sym = row.price_unit === 'usd' ? '$' : '€';
  return { label: `${sym}${n}`, rail };
}

/**
 * Read-only feed of recent approved flashes for a streamer — the v9 viewer
 * screen's "Flashes · live" panel in the left column. Polls on mount and
 * subscribes to realtime inserts so new flashes appear as the streamer
 * approves them.
 */
export default function ViewerFlashesFeed({ supabase, profileId, limit = 6 }: Props) {
  const [flashes, setFlashes] = useState<FlashRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('flashes')
        .select('id, viewer_name, message, payment_method, price_value, price_unit, created_at')
        .eq('profile_id', profileId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!cancelled) setFlashes((data ?? []) as FlashRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, limit]);

  // Realtime insert/update — prepend new approved rows.
  useEffect(() => {
    const channel = supabase
      .channel(`viewer_flashes_${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        async () => {
          const { data } = await supabase
            .from('flashes')
            .select('id, viewer_name, message, payment_method, price_value, price_unit, created_at')
            .eq('profile_id', profileId)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(limit);
          setFlashes((data ?? []) as FlashRow[]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profileId, limit]);

  return (
    <div>
      <div className="casi-v9-feed-head">Flashes · live</div>
      {flashes === null ? (
        <div className="casi-v9-flash-empty">Loading…</div>
      ) : flashes.length === 0 ? (
        <div className="casi-v9-flash-empty">No flashes yet — be the first.</div>
      ) : (
        <div className="casi-v9-flash-list">
          {flashes.map((f) => {
            const amt = formatAmount(f);
            return (
              <div key={f.id} className="casi-v9-flash-item">
                <span className="casi-v9-flash-who">
                  {f.viewer_name ? `@${f.viewer_name}` : 'anon'}
                </span>
                <span className="casi-v9-flash-msg">
                  {f.message ? `"${f.message}"` : '—'}
                </span>
                <span className={`casi-v9-flash-amt casi-v9-${amt.rail}`}>{amt.label}</span>
                <span className="casi-v9-flash-time">{formatTime(f.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
