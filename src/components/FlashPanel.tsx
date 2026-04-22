'use client';

// FlashPanel
//
// Replaces the old ChatPanel. CASI deliberately doesn't host a generic text
// chat — every on-screen message is a superchat-style Flash (paid or a
// rate-limited free tier), so this panel is dedicated to flashes only:
//
//   - Feed: approved flashes for the streamer, rendered chat-style with
//     an amount badge + viewer name + message.
//   - Composer (viewer mode): embeds <SendFlashSection /> inline so the
//     "chat box" UI is also the "send a flash" UI — one place, one input.
//   - Admin mode: composer hidden, rows get a ✕ delete affordance.
//
// chat_messages table is no longer read or written by this component.
// Historical data remains in place; drop at will in a follow-up migration.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import SendFlashSection from '@/components/overlay/SendFlashSection';
import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';

type FlashRow = {
  id: string;
  profile_id: string;
  viewer_name: string;
  message: string;
  amount_cents: number | null;
  tx_signature: string | null;
  payment_method: 'stripe' | 'solana' | 'free' | string | null;
  status: 'pending' | 'approved' | 'denied' | string;
  created_at: string;
};

interface StreamerProfileLite {
  id?: string;
  solana_wallet?: string | null;
  allow_free_flashes?: boolean | null;
  stripe_account_id?: string | null;
}

type Props = {
  profileId: string;
  /** Viewer's local name. Required to send; admin mode passes null. */
  viewerName: string | null;
  /** Streamer moderation mode — shows delete buttons, hides the composer. */
  isAdmin?: boolean;
  /** Visual variant. `compact` is used inside the admin studio. */
  variant?: 'default' | 'compact';
  /**
   * Streamer profile — used by the embedded flash composer to decide which
   * payment rails to offer. Omit in admin mode (no composer rendered).
   */
  streamerProfile?: StreamerProfileLite;
  username?: string;
  /** Shared toast channel. Passed through to SendFlashSection. */
  showNotif?: (text: string, type: string) => void;
};

const MAX_HISTORY = 50;

function formatTs(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function flashAmount(f: FlashRow): string | null {
  if (f.payment_method === 'free' || !f.amount_cents) return null;
  if (f.payment_method === 'solana') return `${(f.amount_cents / 100).toFixed(0)} USDC`;
  return `$${(f.amount_cents / 100).toFixed(2)}`;
}

export default function FlashPanel({
  profileId,
  viewerName,
  isAdmin = false,
  variant = 'default',
  streamerProfile,
  username,
  showNotif,
}: Props) {
  const supabase = createClient();
  const [flashes, setFlashes] = useState<FlashRow[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Load the approved flash history + subscribe for new ones. Denied /
  // pending rows are deliberately excluded from the feed — the feed is a
  // "what has been on stream" log, and pending/denied never aired.
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('flashes')
      .select('id, profile_id, viewer_name, message, amount_cents, tx_signature, payment_method, status, created_at')
      .eq('profile_id', profileId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY);
    setFlashes((data || []).slice().reverse());
  }, [supabase, profileId]);

  useEffect(() => {
    if (!profileId) return;
    load();
    const channel = supabase
      .channel(`flashes_panel_${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        (payload) => {
          const next = payload.new as FlashRow | undefined;
          const prev = payload.old as FlashRow | undefined;
          // Approved row appeared / changed → merge into feed.
          if (next && next.status === 'approved') {
            setFlashes((cur) => {
              const without = cur.filter((f) => f.id !== next.id);
              const updated = [...without, next];
              return updated.length > MAX_HISTORY ? updated.slice(updated.length - MAX_HISTORY) : updated;
            });
            return;
          }
          // Row deleted or flipped out of approved → drop from feed.
          if (payload.eventType === 'DELETE' || (next && next.status !== 'approved')) {
            const dropId = next?.id ?? prev?.id;
            if (dropId) setFlashes((cur) => cur.filter((f) => f.id !== dropId));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profileId, load]);

  // Auto-scroll to the latest flash on update.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [flashes]);

  const onDelete = async (id: string) => {
    if (!isAdmin) return;
    setFlashes((prev) => prev.filter((f) => f.id !== id));
    await supabase.from('flashes').delete().eq('id', id);
  };

  // Composer renders only with everything it needs: viewer name, a
  // streamer profile with at least one payment rail, a toast channel.
  // Admin mode and missing props silently hide the composer.
  const canCompose =
    !isAdmin &&
    !!viewerName &&
    !!streamerProfile &&
    !!username &&
    !!showNotif &&
    (
      !!streamerProfile.stripe_account_id ||
      !!streamerProfile.solana_wallet ||
      !!streamerProfile.allow_free_flashes
    );

  const compact = variant === 'compact';
  // No hard `height` cap — when the composer expands it needs room and
  // overflow:hidden was clipping the Pay button off the bottom. Frame
  // has a minHeight for visual presence; feed caps its own scroll area
  // so it doesn't push the composer out of view.
  const frame: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--casi-surface)',
    border: '1px solid var(--casi-border)',
    borderRadius: 12,
    overflow: 'visible',
    minHeight: compact ? 320 : 420,
    fontFamily: "'Syne', sans-serif",
  };
  const header: React.CSSProperties = {
    padding: '10px 14px',
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'var(--casi-text-muted)',
    borderBottom: '1px solid var(--casi-border)',
    display: 'flex',
    justifyContent: 'space-between',
  };
  const list: React.CSSProperties = {
    overflowY: 'auto',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: compact ? 220 : 300,
    minHeight: 80,
    flexShrink: 0,
  };
  const composerFrame: React.CSSProperties = {
    borderTop: '1px solid var(--casi-border)',
    padding: 10,
    background: 'rgba(255,255,255,0.02)',
  };

  return (
    <div style={frame}>
      <div style={header}>
        <span>⚡ flashes</span>
        <span>{flashes.length}/{MAX_HISTORY}</span>
      </div>
      <div ref={listRef} style={list}>
        {flashes.length === 0 ? (
          <div style={{ color: 'var(--casi-text-muted)', fontSize: 12, textAlign: 'center', padding: 24, lineHeight: 1.5 }}>
            {isAdmin ? 'No flashes yet.' : 'No flashes yet — be the first to send one!'}
          </div>
        ) : (
          flashes.map((f) => {
            const amt = flashAmount(f);
            return (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: '6px 8px',
                  borderRadius: 8,
                  background: amt ? 'rgba(var(--casi-accent-rgb),0.06)' : 'rgba(74,222,128,0.05)',
                  border: `1px solid ${amt ? 'rgba(var(--casi-accent-rgb),0.14)' : 'rgba(74,222,128,0.18)'}`,
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)', flexShrink: 0, paddingTop: 2 }}>
                  {formatTs(f.created_at)}
                </span>
                {amt ? (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: 'var(--casi-accent)', background: 'rgba(var(--casi-accent-rgb),0.1)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {amt}
                  </span>
                ) : (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.1)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                    FREE
                  </span>
                )}
                <span style={{ color: 'var(--casi-accent)', fontWeight: 700, flexShrink: 0 }}>{f.viewer_name}</span>
                <span style={{ color: 'var(--casi-text)', wordBreak: 'break-word', flex: 1 }}>{f.message}</span>
                {f.payment_method === 'solana' && f.tx_signature && (
                  <a
                    href={`https://solscan.io/tx/${f.tx_signature}${EXPLORER_CLUSTER_QUERY}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#9945FF', textDecoration: 'none', flexShrink: 0, paddingTop: 3 }}
                    title="View on Solscan"
                  >
                    ↗
                  </a>
                )}
                {isAdmin && (
                  <button
                    onClick={() => onDelete(f.id)}
                    title="Delete flash from log"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--casi-text-muted)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '0 4px',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      {canCompose && (
        <div style={composerFrame}>
          <SendFlashSection
            embedded
            profileId={profileId}
            username={username!}
            viewerName={viewerName!}
            showNotif={showNotif!}
            profile={streamerProfile!}
          />
        </div>
      )}
    </div>
  );
}
