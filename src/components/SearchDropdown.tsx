'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

const CSS = `
  .sd-wrap { position: relative; max-width: 520px; margin: 0 auto; }

  .sd-bar {
    display: flex; align-items: center;
    background: #0a0a0a; border: 1px solid #1c1c1c; border-radius: 12px;
    overflow: hidden; transition: border-color .2s;
  }
  .sd-bar:focus-within { border-color: rgba(245,130,32,0.45); }
  .sd-bar.open { border-radius: 12px 12px 0 0; border-color: rgba(245,130,32,0.45); }

  .sd-input {
    flex: 1; background: none; border: none; outline: none;
    padding: 14px 18px; font-family: var(--font-casi-sans), sans-serif; font-size: 15px;
    color: #e8e8e8;
  }
  .sd-input::placeholder { color: #333; }

  .sd-clear {
    background: none; border: none; color: #444; cursor: pointer;
    padding: 0 16px; font-size: 18px; line-height: 1;
    transition: color .15s; flex-shrink: 0;
  }
  .sd-clear:hover { color: #e8e8e8; }

  /* ── Dropdown ── */
  .sd-drop {
    position: absolute; top: 100%; left: 0; right: 0; z-index: 200;
    background: #0a0a0a; border: 1px solid rgba(245,130,32,0.45);
    border-top: none; border-radius: 0 0 12px 12px;
    box-shadow: 0 24px 48px rgba(0,0,0,0.75);
    animation: sd-in .12s ease;
    overflow: hidden;
  }
  @keyframes sd-in { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

  .sd-status {
    padding: 18px; text-align: center;
    font-family: var(--font-casi-mono), monospace; font-size: 11px;
    color: #333; letter-spacing: 1px;
  }

  .sd-result {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 16px; text-decoration: none;
    border-top: 1px solid #111; transition: background .12s;
  }
  .sd-result:hover { background: rgba(255,255,255,0.03); }

  .sd-avatar {
    width: 38px; height: 38px; border-radius: 8px;
    background: #111; border: 1px solid #1c1c1c;
    flex-shrink: 0; display: flex; align-items: center;
    justify-content: center; font-size: 16px; overflow: hidden;
  }
  .sd-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .sd-info { flex: 1; min-width: 0; }
  .sd-name-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; flex-wrap: wrap; }
  .sd-name { font-size: 13px; font-weight: 700; color: #e8e8e8; }
  .sd-live-badge {
    display: inline-flex; align-items: center; gap: 3px;
    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
    color: #f87171; font-family: var(--font-casi-mono), monospace;
    font-size: 8px; letter-spacing: 1.5px; text-transform: uppercase;
    padding: 1px 6px; border-radius: 10px;
  }
  .sd-live-dot { width: 4px; height: 4px; border-radius: 50%; background: #f87171; animation: sd-pulse 1.5s infinite; }
  @keyframes sd-pulse { 0%,100%{opacity:1} 50%{opacity:.2} }
  .sd-handle { font-family: var(--font-casi-mono), monospace; font-size: 10px; color: #444; }
  .sd-bio {
    font-family: var(--font-casi-mono), monospace; font-size: 10px; color: #2f2f2f;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;
  }
  .sd-cta {
    font-family: var(--font-casi-mono), monospace; font-size: 10px;
    letter-spacing: 1px; text-transform: uppercase;
    margin-left: auto; flex-shrink: 0; padding-left: 8px;
  }

  /* ── Footer ── */
  .sd-footer {
    padding: 9px 16px; border-top: 1px solid #111;
    display: flex; align-items: center; justify-content: space-between;
  }
  .sd-toggle {
    display: flex; align-items: center; gap: 6px;
    font-family: var(--font-casi-mono), monospace; font-size: 9px;
    letter-spacing: 1.5px; text-transform: uppercase;
    color: #444; background: none; border: none; cursor: pointer;
    padding: 4px 8px; border-radius: 6px; transition: all .12s;
  }
  .sd-toggle:hover { background: rgba(255,255,255,0.04); color: #888; }
  .sd-toggle.on { color: #f87171; }
  .sd-toggle-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .sd-toggle.on .sd-toggle-dot { animation: sd-pulse 1.5s infinite; }
  .sd-count { font-family: var(--font-casi-mono), monospace; font-size: 9px; color: #2f2f2f; }

  /* ── Live strip ── */
  .sd-strip {
    display: flex; gap: 8px; margin-top: 14px;
    overflow-x: auto; padding-bottom: 2px; scrollbar-width: none;
  }
  .sd-strip::-webkit-scrollbar { display: none; }

  .sd-chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.18);
    border-radius: 20px; padding: 5px 10px 5px 8px;
    text-decoration: none; white-space: nowrap; flex-shrink: 0;
    transition: background .15s, border-color .15s;
  }
  .sd-chip:hover { background: rgba(239,68,68,0.11); border-color: rgba(239,68,68,0.32); }
  .sd-chip-dot { width: 5px; height: 5px; border-radius: 50%; background: #f87171; animation: sd-pulse 1.5s infinite; flex-shrink: 0; }
  .sd-chip-av {
    width: 18px; height: 18px; border-radius: 50%; background: #1c1c1c;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; overflow: hidden; flex-shrink: 0;
  }
  .sd-chip-av img { width: 100%; height: 100%; object-fit: cover; }
  .sd-chip-name { font-family: var(--font-casi-mono), monospace; font-size: 10px; color: #ccc; letter-spacing: 0.3px; }

  /* Mobile */
  @media (max-width: 640px) {
    .sd-result { padding: 10px 12px; gap: 10px; }
    .sd-avatar  { width: 32px; height: 32px; border-radius: 6px; font-size: 14px; }
    .sd-cta     { display: none; }
  }
`;

export default function SearchDropdown() {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<any[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [dropOpen, setDropOpen]     = useState(false);
  const [liveOnly, setLiveOnly]     = useState(false);
  const [liveNow, setLiveNow]       = useState<any[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const supabase    = createClient();

  // Fetch live strip on mount
  useEffect(() => {
    supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('is_live', true)
      .order('username')
      .then(({ data }) => setLiveNow(data || []));
  }, [supabase]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setResults([]); setDropOpen(false); setSearching(false); return; }

    setSearching(true);
    setDropOpen(true);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, bio, is_live')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%,bio.ilike.%${q}%`)
        .order('is_live', { ascending: false })
        .limit(8);
      setResults(data || []);
      setSearching(false);
    }, 250);
  }, [query, supabase]);

  // Close on outside click / Escape
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setDropOpen(false); };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, []);

  const shown = liveOnly ? results.filter(r => r.is_live) : results;

  return (
    <>
      <style>{CSS}</style>

      <div className="sd-wrap" ref={wrapRef}>
        {/* Input bar */}
        <div className={`sd-bar${dropOpen ? ' open' : ''}`}>
          <input
            className="sd-input"
            type="text"
            placeholder="Search for a streamer or channel…"
            value={query}
            autoFocus
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (query.trim()) setDropOpen(true); }}
          />
          {query && (
            <button className="sd-clear" onClick={() => { setQuery(''); setResults([]); setDropOpen(false); }}>
              ×
            </button>
          )}
        </div>

        {/* Dropdown */}
        {dropOpen && (
          <div className="sd-drop">
            {isSearching ? (
              <div className="sd-status">Searching…</div>
            ) : shown.length === 0 ? (
              <div className="sd-status">{liveOnly ? 'No live streamers match' : 'No results'}</div>
            ) : (
              shown.map(p => (
                <a key={p.username} href={`/overlay?s=${p.username}`} className="sd-result">
                  <div className="sd-avatar">
                    {p.avatar_url ? <img src={p.avatar_url} alt="" /> : '👤'}
                  </div>
                  <div className="sd-info">
                    <div className="sd-name-row">
                      <span className="sd-name">{p.display_name || p.username}</span>
                      {p.is_live && (
                        <span className="sd-live-badge">
                          <span className="sd-live-dot" /> Live
                        </span>
                      )}
                    </div>
                    <div className="sd-handle">@{p.username}</div>
                    {p.bio && <div className="sd-bio">{p.bio}</div>}
                  </div>
                  <span className="sd-cta" style={{ color: p.is_live ? '#06b6d4' : '#444' }}>
                    {p.is_live ? 'Watch →' : 'View →'}
                  </span>
                </a>
              ))
            )}
            <div className="sd-footer">
              <button className={`sd-toggle${liveOnly ? ' on' : ''}`} onClick={() => setLiveOnly(v => !v)}>
                <span className="sd-toggle-dot" /> Live only
              </button>
              {!isSearching && shown.length > 0 && (
                <span className="sd-count">{shown.length} result{shown.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live strip — shown when not searching */}
      {!query && liveNow.length > 0 && (
        <div className="sd-strip">
          {liveNow.map(p => (
            <a key={p.username} href={`/overlay?s=${p.username}`} className="sd-chip">
              <span className="sd-chip-dot" />
              <div className="sd-chip-av">
                {p.avatar_url ? <img src={p.avatar_url} alt="" /> : '👤'}
              </div>
              <span className="sd-chip-name">{p.display_name || p.username}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
