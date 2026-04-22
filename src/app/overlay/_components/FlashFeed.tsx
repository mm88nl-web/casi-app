'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';

type FlashItem = {
  id: string;
  viewer_name: string;
  message: string;
  amount_cents: number;
  enteredAt: number;
  tx_signature?: string | null;
};

const DISPLAY_MS = 25_000;

export default function FlashFeed({ profileId }: { profileId: string }) {
  const [items, setItems] = useState<FlashItem[]>([]);
  const supabase = useRef(createClient()).current;

  // Hydrate with any flashes approved in the last DISPLAY_MS on mount.
  useEffect(() => {
    const since = new Date(Date.now() - DISPLAY_MS).toISOString();
    supabase
      .from('flashes')
      .select('id, viewer_name, message, amount_cents, tx_signature')
      .eq('profile_id', profileId)
      .eq('status', 'approved')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (data?.length) setItems(data.map(f => ({ ...f, enteredAt: Date.now() })));
      });
  }, [profileId, supabase]);

  // Real-time: listen for flashes being approved.
  useEffect(() => {
    const channel = supabase
      .channel(`flash_feed_${profileId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        (payload) => {
          if (payload.new?.status === 'approved') {
            setItems(prev => {
              const n = payload.new as Record<string, unknown>;
              const item: FlashItem = {
                id:            n.id as string,
                viewer_name:   n.viewer_name as string,
                message:       n.message as string,
                amount_cents:  n.amount_cents as number,
                tx_signature:  n.tx_signature as string | null | undefined,
                enteredAt:     Date.now(),
              };
              return [...prev.filter(f => f.id !== item.id), item].slice(-5);
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileId, supabase]);

  // Auto-expire items after DISPLAY_MS.
  useEffect(() => {
    const iv = setInterval(() => {
      setItems(prev => prev.filter(f => Date.now() - f.enteredAt < DISPLAY_MS));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  if (!items.length) return null;

  return (
    <div style={{ position: 'absolute', bottom: 28, right: 28, width: 290, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 200, pointerEvents: 'none' }}>
      <style>{`@keyframes flashPop{from{opacity:0;transform:scale(0.82) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      {items.map(flash => (
        <div key={flash.id} style={{ animation: 'flashPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, paddingLeft: 4 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, color: 'var(--casi-accent)', textShadow: '0 1px 6px rgba(0,0,0,0.9)', letterSpacing: 0.5 }}>
              ⚡ {flash.viewer_name}
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, background: 'rgba(var(--casi-accent-rgb),0.18)', color: 'var(--casi-accent)', border: '1px solid rgba(var(--casi-accent-rgb),0.35)', borderRadius: 20, padding: '1px 8px' }}>
              ${(flash.amount_cents / 100).toFixed(2)}
            </span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.93)', borderRadius: '18px 18px 4px 18px', padding: '11px 15px', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: '#0d0d0d', lineHeight: 1.45, margin: 0 }}>
              {flash.message}
            </p>
            {flash.tx_signature && (
              <a
                href={`https://solscan.io/tx/${flash.tx_signature}${EXPLORER_CLUSTER_QUERY}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#9945FF', textDecoration: 'none', opacity: 0.7, pointerEvents: 'auto' }}
              >
                ↗ verify on Solscan
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
