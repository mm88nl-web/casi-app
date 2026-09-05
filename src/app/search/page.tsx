'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { CasiMark } from '@/components/v9/CasiMark';
import { Wordmark } from '@/components/v9/Wordmark';
import WalletPill from '@/components/WalletPill';
import { VIEWER_NAME_KEY } from '@/app/overlay/_components/viewerStorage';

type Profile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  ink_color: string | null;
  theme_color: string | null;
  is_live: boolean;
};

export default function SearchPage() {
  const supabase = createClient();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [query, setQuery] = useState('');
  // Read-only here — /search never prompts for a name (frictionless browsing
  // is a hard product constraint), it only reflects one already set from a
  // prior /overlay visit. Client-only read since localStorage isn't
  // available during SSR.
  const [savedViewerName, setSavedViewerName] = useState<string | null>(null);
  useEffect(() => {
    try { setSavedViewerName(localStorage.getItem(VIEWER_NAME_KEY)); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, bio, ink_color, theme_color, is_live')
        .order('is_live', { ascending: false })
        .order('username');
      if (!cancelled) setProfiles((data ?? []) as Profile[]);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const liveCount = profiles?.filter(p => p.is_live).length ?? 0;
  const showLive = liveCount > 0;

  const filtered = profiles === null ? null : query.trim() === ''
    ? profiles
    : profiles.filter(p => {
        const q = query.toLowerCase();
        return (
          p.username.toLowerCase().includes(q) ||
          (p.display_name ?? '').toLowerCase().includes(q)
        );
      });

  return (
    <main className="casi-search" data-paper="light">
      {/* NAV */}
      <header className="nav">
        <Link href="/" className="nav-logo" aria-label="Casi">
          <CasiMark />
          <Wordmark />
        </Link>
        <div className="nav-r">
          {savedViewerName && (
            <div className="viewer-chip">
              <span className="vdot" />
              <span className="vname">@{savedViewerName}</span>
            </div>
          )}
          <WalletPill />
          <Link href="/login" className="login-link">Log in</Link>
        </div>
      </header>

      {/* HEAD */}
      <section className="head">
        <h1>Find a streamer</h1>
        <p className="head-sub">Take a slot on a live overlay for a few minutes.</p>
        <div className="search-wrap">
          <span className="search-icon" aria-hidden="true" />
          <input
            className="search-input"
            type="search"
            placeholder="Search a streamer, game or tag"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {showLive && <span className="search-live">{liveCount} live</span>}
        </div>
      </section>

      {/* GRID */}
      <section className="body">
        {filtered === null ? (
          <div className="loading">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <h2>{query ? `No streamers matching "${query}"` : 'No streamers yet.'}</h2>
            <p>{query ? 'Try a different name.' : 'Be the first to go live.'}</p>
            {!query && (
              <Link href="/studio" className="empty-cta">
                Go live yourself →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid">
            {filtered.map(p => {
              // Falls back to --ink, which .casi-search shadows to the
              // fixed --chrome-ink below — /search is Casi's own browse
              // chrome, not a per-streamer skin surface, so an unset
              // streamer accent shouldn't fall back to a hardcoded hex.
              const accent = p.ink_color || p.theme_color || 'var(--ink)';
              const initial = (p.display_name || p.username).charAt(0).toUpperCase();
              return (
                <Link
                  key={p.username}
                  href={`/overlay?s=${p.username}`}
                  className={`card${p.is_live ? '' : ' offline'}`}
                  style={{ '--card-ink': accent } as React.CSSProperties}
                >
                  <div className="card-body">
                    <div className="card-avatar">
                      {p.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.avatar_url} alt="" />
                        : <span>{initial}</span>
                      }
                    </div>
                    <div className="card-meta">
                      <div className="card-name-row">
                        <span className="card-name">{p.display_name || p.username}</span>
                        {p.is_live && (
                          <span className="live-pill">
                            <span className="live-dot" />
                            {/* viewer count not available in DB — just show live indicator */}
                            live
                          </span>
                        )}
                      </div>
                      <div className="card-handle">@{p.username}</div>
                    </div>
                  </div>
                  <p className="card-bio">
                    {p.bio || <span className="card-bio-empty">No bio yet.</span>}
                  </p>
                  <div className="card-foot">
                    <span className="card-pill">{p.is_live ? 'visit · book' : 'view page'}</span>
                    <span className="card-arrow">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* TRUST STRIP */}
      <div className="trust-strip">
        <span>free or paid</span>
        <span className="pip" aria-hidden="true" />
        <span>approval gated</span>
        <span className="pip" aria-hidden="true" />
        <span>solana · stripe</span>
      </div>

      {/* FOOTER */}
      <footer className="foot">
        <div className="foot-left">
          <span>© {new Date().getFullYear()} Casi</span>
          <a href="https://github.com/mm88nl-web/casi-app" target="_blank" rel="noopener noreferrer">github</a>
        </div>
        <div className="foot-right">
          <Link href="/legal/terms">terms</Link>
          <Link href="/legal/privacy">privacy</Link>
          <Link href="/legal/aup">use</Link>
        </div>
      </footer>

      <style jsx global>{`
        html, body { background: var(--chrome-paper); }
      `}</style>
      <style jsx>{`
        .casi-search {
          /* Pin the whole subtree to Casi's fixed brand identity, not the
             mutable --ink/--paper roots — /search lists many streamers, so
             it's Casi's own browse chrome, never one streamer's skin. Same
             pattern as .casi-landing in src/app/page.tsx — see --chrome-*
             in globals.css. --H/--S/--M are intentionally left to inherit
             the global :root definitions (already Archivo/Newsreader/
             Spline Sans Mono) instead of redeclaring stale font-family
             fallback names here. */
          --paper:  var(--chrome-paper);
          --ink:    var(--chrome-ink);
          --accent: var(--chrome-accent);
          --type:   var(--chrome-text);
          --type-2: var(--chrome-text-2);

          background: var(--paper);
          color: var(--type);
          font-family: var(--H);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
        }

        /* Mark + wordmark sizing in nav */
        .casi-search :global(.casi-v9-wordmark) {
          color: var(--type);
          font-family: var(--H);
          font-weight: 800;
          font-size: 24px;
          letter-spacing: -0.035em;
          line-height: 1;
        }
        .casi-search :global(.casi-v9-wordmark .casi-v9-dot) { color: var(--accent); }
        .casi-search :global(.casi-v9-mark) { color: var(--ink); width: 56px; height: 28px; }

        /* NAV */
        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          row-gap: 12px;
          padding: 28px 40px;
          flex-shrink: 0;
        }
        @media (max-width: 640px) { .nav { padding: 22px 22px; } }
        .nav-logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
        /* flex-wrap here specifically -- on a narrow viewport the viewer
           chip + MobileWalletPicker's two deeplink buttons + the login
           link don't fit on one line. Before this they had nowhere to go
           but overflow/collide instead of wrapping onto their own row --
           confirmed on a real device screenshot, not a hypothetical. */
        .nav-r { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 10px 14px; }
        @keyframes blink {
          0%   { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent) 55%, transparent); }
          100% { box-shadow: 0 0 0 9px color-mix(in oklab, var(--accent)  0%, transparent); }
        }
        /* Same read-only identity chip as /overlay's viewer-chip (see
           src/app/overlay/page.tsx) -- kept view-only here, no inline
           rename, since /search isn't where a viewer manages their name. */
        .viewer-chip {
          display: flex; align-items: center; gap: 6px;
          background: color-mix(in oklab, var(--ink) 4%, var(--paper));
          border: 1px solid color-mix(in oklab, var(--ink) 18%, var(--paper));
          border-radius: 999px; padding: 6px 13px;
        }
        .vdot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: blink 1.5s infinite; flex-shrink: 0; }
        .vname { font-family: var(--M); font-size: 11px; color: var(--type-2); }
        .login-link {
          font-family: var(--S); font-style: italic; font-size: 16px; color: var(--type-2);
          border-bottom: 1.5px solid color-mix(in oklab, var(--type) 24%, transparent);
          padding-bottom: 1px; text-decoration: none; white-space: nowrap;
        }
        @media (max-width: 540px) {
          .login-link { font-size: 14px; }
          .vname { max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }

        /* HEAD */
        .head {
          padding: 0 40px 48px;
          border-bottom: 1px solid color-mix(in oklab, var(--type) 10%, transparent);
        }
        @media (max-width: 640px) { .head { padding: 0 22px 36px; } }
        h1 {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(44px, 6.5vw, 64px);
          letter-spacing: -0.03em;
          line-height: 1;
          color: var(--type);
        }
        .head-sub {
          font-family: var(--S);
          font-size: 19px;
          color: var(--type-2);
          margin-top: 10px;
        }

        /* SEARCH INPUT */
        .search-wrap {
          margin-top: 28px;
          position: relative;
          max-width: 640px;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          left: 22px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 1.5px solid var(--type-2);
          opacity: 0.6;
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          padding: 16px 90px 16px 48px;
          background: color-mix(in oklab, var(--paper) 70%, white);
          color: var(--type);
          border: 1.5px solid color-mix(in oklab, var(--type) 18%, transparent);
          border-radius: 999px;
          font-family: var(--H);
          font-size: 16px;
          font-weight: 500;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
          transition: border-color 0.14s;
          box-sizing: border-box;
        }
        .search-input::placeholder { color: var(--type-2); opacity: 0.6; }
        .search-input:focus { border-color: var(--ink); }
        .search-input::-webkit-search-cancel-button { display: none; }
        .search-live {
          position: absolute;
          right: 22px;
          top: 50%;
          transform: translateY(-50%);
          font-family: var(--M);
          font-size: 12px;
          color: var(--type-2);
          pointer-events: none;
          white-space: nowrap;
        }

        /* BODY */
        .body { flex: 1; padding: 32px 40px 60px; }
        @media (max-width: 640px) { .body { padding: 24px 22px 48px; } }

        .loading {
          font-family: var(--M); font-size: 11px; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--type-2);
          padding: 48px 0; text-align: center;
        }
        .empty { max-width: 480px; padding: 48px 0; }
        .empty h2 {
          font-family: var(--H); font-weight: 700;
          font-size: clamp(28px, 4vw, 40px);
          letter-spacing: -0.025em; color: var(--type);
        }
        .empty p { margin-top: 12px; font-size: 15px; color: var(--type-2); }
        .empty-cta {
          display: inline-flex; align-items: center; gap: 10px; margin-top: 20px;
          background: var(--ink); color: var(--paper);
          padding: 13px 22px; border-radius: 999px;
          font-family: var(--H); font-weight: 700; font-size: 15px;
          text-decoration: none; letter-spacing: -0.01em;
        }

        /* GRID */
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 360px));
          gap: 18px;
          justify-content: start;
        }
        @media (max-width: 480px) { .grid { grid-template-columns: 1fr; } }

        /* CARD */
        .card {
          display: flex;
          flex-direction: column;
          background: color-mix(in oklab, var(--paper) 80%, white);
          border: 1.5px solid color-mix(in oklab, var(--type) 12%, transparent);
          border-radius: 20px;
          overflow: hidden;
          text-decoration: none;
          color: inherit;
          transition: transform 0.15s, border-color 0.15s;
        }
        .card:hover { transform: translateY(-2px); border-color: var(--card-ink); }
        .card.offline { opacity: 0.78; }

        /* Card body — avatar + name/live inline */
        .card-body {
          padding: 20px 20px 0;
          display: grid;
          grid-template-columns: auto 1fr;
          column-gap: 14px;
          align-items: center;
        }
        .card-avatar {
          width: 48px; height: 48px;
          border-radius: 50%;
          background: color-mix(in oklab, var(--card-ink) 14%, var(--paper));
          color: var(--card-ink);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--H); font-weight: 800; font-size: 21px; letter-spacing: -0.04em;
          border: 1.5px solid color-mix(in oklab, var(--card-ink) 30%, transparent);
          overflow: hidden;
          flex-shrink: 0;
        }
        .card.offline .card-avatar {
          background: color-mix(in oklab, var(--type) 6%, var(--paper));
          color: var(--type-2);
          border-color: color-mix(in oklab, var(--type) 14%, transparent);
        }
        .card-avatar :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
        .card-meta { min-width: 0; }
        .card-name-row {
          display: flex; align-items: center; gap: 8px; min-width: 0;
        }
        .card-name {
          font-family: var(--H); font-weight: 700; font-size: 18px;
          letter-spacing: -0.02em; color: var(--type); line-height: 1.15;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
        }
        .live-pill {
          flex-shrink: 0;
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 8px; border-radius: 999px;
          background: color-mix(in oklab, var(--accent) 14%, var(--paper));
          border: 1px solid color-mix(in oklab, var(--accent) 30%, transparent);
          color: var(--accent);
          font-family: var(--M); font-size: 9.5px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap;
        }
        .live-dot {
          width: 5px; height: 5px; border-radius: 50%; background: var(--accent);
          animation: livePulse 1.8s ease-in-out infinite;
        }
        @keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .card-handle {
          font-family: var(--M); font-size: 11px;
          color: var(--type-2); margin-top: 3px; letter-spacing: 0.02em;
        }
        .card-bio {
          padding: 14px 20px 18px;
          font-size: 13.5px; line-height: 1.5; color: var(--type-2);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .card-bio-empty { font-style: italic; opacity: 0.6; }
        .card-foot {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px;
          border-top: 1px solid color-mix(in oklab, var(--type) 8%, transparent);
        }
        .card-pill {
          padding: 6px 12px; border-radius: 999px;
          background: var(--card-ink); color: var(--paper);
          font-family: var(--M); font-size: 10px; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase; white-space: nowrap;
        }
        .card-arrow {
          font-family: var(--M); font-size: 16px; color: var(--type-2);
        }

        /* TRUST STRIP */
        .trust-strip {
          display: flex; align-items: center; justify-content: center;
          gap: 14px; flex-wrap: wrap;
          font-family: var(--M); font-size: 10.5px;
          letter-spacing: 0.22em; text-transform: uppercase;
          color: var(--type-2); padding: 0 40px 32px;
        }
        .pip { width: 5px; height: 5px; border-radius: 50%; background: var(--ink); opacity: 0.7; display: inline-block; }

        /* FOOTER */
        .foot {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 14px; padding: 16px 40px 28px;
          font-family: var(--M); font-size: 11px; letter-spacing: 0.04em; color: var(--type-2);
          border-top: 1px solid color-mix(in oklab, var(--type) 10%, transparent);
        }
        @media (max-width: 640px) { .foot { padding: 16px 22px 24px; } }
        .foot-left, .foot-right { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .foot a { text-decoration: none; color: inherit; }
      `}</style>
    </main>
  );
}
