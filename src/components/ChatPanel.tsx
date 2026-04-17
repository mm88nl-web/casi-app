'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type ChatMessage = {
  id: string;
  profile_id: string;
  viewer_name: string;
  message: string;
  created_at: string;
};

type Props = {
  profileId: string;
  /** Viewer's local name. Required to post; admin mode can pass null. */
  viewerName: string | null;
  /** Streamer moderation mode — shows delete buttons, hides the composer. */
  isAdmin?: boolean;
  /** Visual variant. `compact` is used inside the admin dashboard. */
  variant?: 'default' | 'compact';
};

const MAX_HISTORY = 50;
const MAX_MESSAGE_LEN = 500;

function formatTs(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function ChatPanel({ profileId, viewerName, isAdmin = false, variant = 'default' }: Props) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY);
    setMessages((data || []).slice().reverse());
  }, [supabase, profileId]);

  useEffect(() => {
    if (!profileId) return;
    load();
    const channel = supabase
      .channel(`chat_${profileId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `profile_id=eq.${profileId}` },
        (payload) => {
          setMessages((prev) => {
            const next = [...prev, payload.new as ChatMessage];
            return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `profile_id=eq.${profileId}` },
        (payload) => {
          const removed = payload.old as { id?: string };
          if (!removed?.id) return;
          setMessages((prev) => prev.filter((m) => m.id !== removed.id));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profileId, load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !viewerName || sending) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase.from('chat_messages').insert({
      profile_id: profileId,
      viewer_name: viewerName,
      message: trimmed.slice(0, MAX_MESSAGE_LEN),
    });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft('');
  };

  const onDelete = async (id: string) => {
    if (!isAdmin) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.from('chat_messages').delete().eq('id', id);
  };

  const compact = variant === 'compact';
  const frame: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--casi-surface)',
    border: '1px solid var(--casi-border)',
    borderRadius: 12,
    overflow: 'hidden',
    height: compact ? 320 : 420,
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
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };
  const composer: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    padding: 10,
    borderTop: '1px solid var(--casi-border)',
    background: 'rgba(255,255,255,0.02)',
  };

  return (
    <div style={frame}>
      <div style={header}>
        <span>chat</span>
        <span>{messages.length}/{MAX_HISTORY}</span>
      </div>
      <div ref={listRef} style={list}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--casi-text-muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>
            No messages yet{viewerName && !isAdmin ? ' — say hi!' : '.'}
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.4 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)', flexShrink: 0, paddingTop: 2 }}>
                {formatTs(m.created_at)}
              </span>
              <span style={{ color: 'var(--casi-accent)', fontWeight: 700, flexShrink: 0 }}>{m.viewer_name}</span>
              <span style={{ color: 'var(--casi-text)', wordBreak: 'break-word', flex: 1 }}>{m.message}</span>
              {isAdmin && (
                <button
                  onClick={() => onDelete(m.id)}
                  title="Delete message"
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
          ))
        )}
      </div>
      {!isAdmin && (
        <div style={composer}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                send();
              }
            }}
            placeholder={viewerName ? 'Send a message…' : 'Set your name to chat'}
            disabled={!viewerName || sending}
            maxLength={MAX_MESSAGE_LEN}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--casi-border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              color: 'var(--casi-text)',
              outline: 'none',
              fontFamily: "'Syne', sans-serif",
            }}
          />
          <button
            onClick={send}
            disabled={!viewerName || !draft.trim() || sending}
            style={{
              background: draft.trim() && viewerName ? 'var(--casi-accent)' : 'var(--casi-border)',
              color: 'var(--casi-bg)',
              border: 'none',
              borderRadius: 8,
              padding: '0 16px',
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              cursor: !viewerName || !draft.trim() || sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      )}
      {error && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--casi-accent2, #ff4444)', background: 'rgba(255,0,0,0.05)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
