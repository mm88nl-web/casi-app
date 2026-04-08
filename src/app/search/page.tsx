"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

function Logo({ scale = 0.32, color = '#F58220', bg = '#050505' }: { scale?: number; color?: string; bg?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width={400 * scale} height={200 * scale}>
      <g stroke={color} fill={color} strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path fill={color} stroke="none" d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z" />
      <circle fill={bg} cx="200" cy="100" r="45" />
    </svg>
  );
}

export default function SearchPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('profiles')
        .select('username, display_name, bio, avatar_url, is_live')
        .order('is_live', { ascending: false })
        .order('username', { ascending: true });
      setProfiles(data || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const filtered = profiles.filter(p => {
    if (liveOnly && !p.is_live) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (p.username || '').toLowerCase().includes(q) ||
      (p.display_name || '').toLowerCase().includes(q) ||
      (p.bio || '').toLowerCase().includes(q);
  });

  const liveCount = profiles.filter(p => p.is_live).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .sp { min-height: 100vh; background: #050505; color: #e8e8e8; font-family: 'Syne', sans-serif; }
        .sp::before {
          content: ''; position: fixed; inset: 0;
          background-image: linear-gradient(rgba(245,130,32,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(245,130,32,0.02) 1px, transparent 1px);
          background-size: 64px 64px; pointer-events: none; z-index: 0;
        }

        /* NAV */
        .sp-nav { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; padding: 0 40px; height: 64px; border-bottom: 1px solid #111; background: rgba(5,5,5,0.94); backdrop-filter: blur(20px); }
        .sp-nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .sp-nav-wm { font-size: 20px; font-weight: 800; color: #F58220; letter-spacing: -0.5px; }
        .live-count { display: flex; align-items: center; gap: 6px; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; animation: blink 1.5s infinite; }

        /* BODY */
        .sp-body { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 48px 40px; }

        /* HEADER */
        .sp-header { margin-bottom: 36px; }
        .sp-eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #F58220; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
        .sp-eyebrow::before { content: ''; display: block; width: 24px; height: 1px; background: #F58220; }
        .sp-title { font-size: clamp(28px, 3vw, 44px); font-weight: 800; letter-spacing: -1.5px; color: #f0f0f0; }

        /* SEARCH BAR */
        .search-row { display: flex; gap: 10px; margin-bottom: 32px; }
        .search-input-wrap { position: relative; flex: 1; }
        .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); font-size: 15px; pointer-events: none; }
        .search-input { width: 100%; background: #0a0a0a; border: 1px solid #1c1c1c; border-radius: 12px; padding: 14px 16px 14px 44px; font-size: 14px; color: #e8e8e8; outline: none; font-family: 'Syne', sans-serif; transition: border-color .2s; }
        .search-input::placeholder { color: #333; }
        .search-input:focus { border-color: rgba(245,130,32,0.35); }
        .live-toggle { display: flex; align-items: center; gap: 8px; padding: 14px 20px; border-radius: 12px; border: 1px solid; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; transition: all .2s; white-space: nowrap; }
        .live-toggle.off { background: #0a0a0a; border-color: #1c1c1c; color: #555; }
        .live-toggle.on  { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #f87171; }

        /* GRID */
        .sp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .sp-card { background: #080808; border: 1px solid #161616; border-radius: 14px; padding: 20px; text-decoration: none; display: block; transition: all .2s; animation: fadeIn .3s ease both; }
        .sp-card:hover { border-color: #2a2a2a; transform: translateY(-2px); background: #0a0a0a; }
        .sp-card-top { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 12px; }
        .sp-avatar { width: 44px; height: 44px; border-radius: 50%; border: 1px solid #1c1c1c; overflow: hidden; background: #0d0d0d; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; }
        .sp-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 3px; }
        .sp-name { font-size: 15px; font-weight: 700; color: #e8e8e8; }
        .live-badge { display: flex; align-items: center; gap: 4px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.25); color: #f87171; font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; padding: 2px 8px; border-radius: 20px; }
        .sp-handle { font-family: 'DM Mono', monospace; font-size: 10px; color: #444; }
        .sp-bio { font-size: 12px; color: #484848; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 14px; }
        .sp-cta { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; transition: color .2s; }

        /* SKELETON */
        .sp-skeleton { background: #080808; border: 1px solid #111; border-radius: 14px; padding: 20px; }
        @keyframes shimmer { 0%{opacity:.4} 50%{opacity:.8} 100%{opacity:.4} }
        .shimmer { animation: shimmer 1.5s infinite; background: #111; border-radius: 6px; }

        /* EMPTY */
        .sp-empty { grid-column: 1/-1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 0; border: 1px dashed #1c1c1c; border-radius: 14px; }
        .sp-empty-text { font-family: 'DM Mono', monospace; font-size: 12px; color: #333; margin-bottom: 8px; }
        .sp-empty-sub  { font-family: 'DM Mono', monospace; font-size: 11px; color: #222; }

        /* MOBILE */
        @media (max-width: 640px) {
          .sp-nav { padding: 0 20px; }
          .sp-body { padding: 32px 20px; }
          .sp-grid { grid-template-columns: 1fr; }
          .live-toggle span.label { display: none; }
        }
      `}</style>

      <div className="sp">
        <nav className="sp-nav">
          <a href="/" className="sp-nav-logo">
            <Logo scale={0.28} />
            <span className="sp-nav-wm">casi</span>
          </a>
          <div className="live-count" style={{ color: liveCount > 0 ? '#f87171' : '#333' }}>
            <span className="live-dot" style={{ background: liveCount > 0 ? '#f87171' : '#333', animation: liveCount > 0 ? 'blink 1.5s infinite' : 'none' }} />
            {liveCount > 0 ? `${liveCount} live now` : 'No streams live'}
          </div>
        </nav>

        <div className="sp-body">
          <div className="sp-header">
            <div className="sp-eyebrow">Discover</div>
            <h1 className="sp-title">Find streamers</h1>
          </div>

          <div className="search-row">
            <div className="search-input-wrap">
              <span className="search-icon">🔍</span>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or bio…" autoFocus className="search-input" />
            </div>
            <button onClick={() => setLiveOnly(!liveOnly)} className={`live-toggle ${liveOnly ? 'on' : 'off'}`}>
              <span className="live-dot" style={{ background: liveOnly ? '#f87171' : '#444', width: 6, height: 6, borderRadius: '50%', animation: liveOnly ? 'blink 1.5s infinite' : 'none' }} />
              <span className="label">Live only</span>
            </button>
          </div>

          <div className="sp-grid">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="sp-skeleton" style={{ animationDelay: `${i * 0.1}s` }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div className="shimmer" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="shimmer" style={{ height: 14, width: '60%', marginBottom: 6 }} />
                      <div className="shimmer" style={{ height: 10, width: '40%' }} />
                    </div>
                  </div>
                  <div className="shimmer" style={{ height: 10, width: '90%', marginBottom: 6 }} />
                  <div className="shimmer" style={{ height: 10, width: '70%' }} />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="sp-empty">
                <div className="sp-empty-text">{liveOnly ? 'No streamers live right now' : query ? `No results for "${query}"` : 'No streamers yet'}</div>
                <div className="sp-empty-sub">Check back soon</div>
              </div>
            ) : (
              filtered.map((p, i) => (
                <a key={p.username} href={`/s/${p.username}`} className="sp-card" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="sp-card-top">
                    <div className="sp-avatar">
                      {p.avatar_url ? <img src={p.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '👤'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sp-name-row">
                        <span className="sp-name">{p.display_name || p.username}</span>
                        {p.is_live && (
                          <span className="live-badge">
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#f87171', animation: 'blink 1.5s infinite' }} />
                            Live
                          </span>
                        )}
                      </div>
                      <div className="sp-handle">@{p.username}</div>
                    </div>
                  </div>
                  {p.bio
                    ? <div className="sp-bio">{p.bio}</div>
                    : <div className="sp-bio" style={{ color: '#2a2a2a', fontStyle: 'italic' }}>No bio yet</div>}
                  <div className="sp-cta" style={{ color: p.is_live ? '#06b6d4' : '#333' }}>
                    {p.is_live ? 'Watch now →' : 'View profile →'}
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
