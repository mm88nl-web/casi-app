'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type LiveProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function BrowseStreamersModal({ open, onClose }: Props) {
  const [live, setLive] = useState<LiveProfile[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let cancelled = false;
    setLive(null);
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, bio')
        .eq('is_live', true)
        .order('username');
      if (!cancelled) setLive((data ?? []) as LiveProfile[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!live) return null;
    const q = query.trim().toLowerCase();
    if (!q) return live;
    return live.filter((p) => {
      const name = (p.display_name ?? '').toLowerCase();
      const handle = p.username.toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [live, query]);

  if (!open) return null;

  return (
    <div className="bsm-backdrop" onClick={onClose}>
      <div className="bsm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bsm-head">
          <div className="bsm-eyebrow">
            <span className="bsm-rule" />
            <span className="bsm-tag">Browse</span>
            {live === null ? '— Live now' : `${live.length} live now`}
          </div>
          <button className="bsm-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <input
          type="text"
          className="bsm-search"
          placeholder="Search by username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="bsm-body">
          {filtered === null ? (
            <div className="bsm-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="bsm-empty">
              {query ? 'No streamers match that name.' : "Nobody's live right now."}
            </div>
          ) : (
            <div className="bsm-list">
              {filtered.map((p) => (
                <a key={p.username} href={`/overlay?s=${p.username}`} className="bsm-card">
                  <div className="bsm-avatar">
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt="" />
                    ) : (
                      (p.display_name || p.username).charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="bsm-info">
                    <div className="bsm-name">{p.display_name || p.username}</div>
                    <div className="bsm-handle">@{p.username}</div>
                  </div>
                  <span className="bsm-live">
                    <span className="bsm-live-dot" />
                    Live
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .bsm-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; padding: 24px; backdrop-filter: blur(4px);
          animation: bsmFade 0.15s ease;
        }
        @keyframes bsmFade { from { opacity: 0 } to { opacity: 1 } }
        .bsm-modal {
          width: 100%; max-width: 560px; max-height: min(80vh, 640px);
          background: var(--surf, var(--casi-surface));
          border: 1px solid var(--line, var(--casi-border));
          display: flex; flex-direction: column;
          font-family: var(--B), inherit;
        }
        .bsm-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px 14px; border-bottom: 1px solid var(--line, var(--casi-border));
        }
        .bsm-eyebrow {
          display: flex; align-items: center; gap: 10px;
          font-family: var(--M), monospace; font-size: 11px;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--text-3, var(--casi-text-muted));
        }
        .bsm-rule { display: block; width: 18px; height: 1px; background: var(--ink, var(--casi-accent)); }
        .bsm-tag {
          padding: 2px 8px; border: 1px solid var(--ink, var(--casi-accent));
          color: var(--ink, var(--casi-accent)); font-size: 9.5px;
        }
        .bsm-close {
          background: none; border: none; color: var(--text-3, var(--casi-text-muted));
          font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px;
        }
        .bsm-close:hover { color: var(--text, var(--casi-text)); }
        .bsm-search {
          margin: 14px 20px 0;
          padding: 10px 12px; background: var(--paper, var(--casi-bg));
          border: 1px solid var(--line, var(--casi-border));
          color: var(--text, var(--casi-text));
          font-family: var(--M), monospace; font-size: 13px;
          outline: none;
        }
        .bsm-search:focus { border-color: var(--ink, var(--casi-accent)); }
        .bsm-body { flex: 1; overflow-y: auto; padding: 14px 20px 20px; }
        .bsm-empty {
          padding: 32px 0; text-align: center;
          font-family: var(--M), monospace; font-size: 12px;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: var(--text-3, var(--casi-text-muted));
        }
        .bsm-list { display: flex; flex-direction: column; gap: 1px; background: var(--line, var(--casi-border)); }
        .bsm-card {
          display: flex; align-items: center; gap: 14px; padding: 14px 16px;
          background: var(--surf, var(--casi-surface));
          color: inherit; text-decoration: none;
          transition: background 0.14s;
        }
        .bsm-card:hover { background: var(--ink-04, rgba(255,255,255,0.04)); }
        .bsm-avatar {
          width: 44px; height: 44px; flex-shrink: 0;
          background: var(--ink, var(--casi-accent));
          color: var(--on-ink, #000);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--H), inherit; font-weight: 800; font-size: 18px;
          overflow: hidden;
        }
        .bsm-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .bsm-info { flex: 1; min-width: 0; }
        .bsm-name {
          font-family: var(--H), inherit; font-weight: 700; font-size: 15px;
          color: var(--text, var(--casi-text)); line-height: 1.2;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .bsm-handle {
          font-family: var(--M), monospace; font-size: 11px;
          color: var(--text-3, var(--casi-text-muted)); margin-top: 2px;
        }
        .bsm-live {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 8px; background: var(--ink, var(--casi-accent));
          color: var(--on-ink, #000);
          font-family: var(--M), monospace; font-size: 9px; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase; flex-shrink: 0;
        }
        .bsm-live-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--on-ink, #000); }
      `}</style>
    </div>
  );
}
