'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { CasiMark } from '@/components/v9/CasiMark';
import { Wordmark } from '@/components/v9/Wordmark';

const P = '#f5e1d2';
const I = '#294b3c';
const A = '#c04830';

type Profile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  ink_color: string | null;
  theme_color: string | null;
  is_live: boolean;
};

function fmtViewers(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function SearchPage() {
  const supabase = createClient();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [query, setQuery] = useState('');

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
          {showLive && (
            <>
              <div className="stamp">
                <span className="n">{liveCount}</span> live
              </div>
              <span className="sep" aria-hidden="true" />
            </>
          )}
          <Link href="/login" className="login-link">Log in</Link>
        </div>
      </header>

      {/* HEAD */}
      <section className="head">
        <div className="eyebrow">— find a stream</div>
        <h1>Find a <em>live stream.</em></h1>
        <div className="search-wrap">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            className="search-input"
            type="search"
            placeholder="search by name or @handle"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
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
              const accent = p.ink_color || p.theme_color || I;
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
        html, body { background: ${P}; }
      `}</style>
      <style jsx>{`
        .casi-search {
          --paper: ${P};
          --ink:   ${I};
          --accent: ${A};
          --type:   #221a14;
          --type-2: #6a574b;
          --H: var(--font-casi-display), 'Bricolage Grotesque', system-ui, sans-serif;
          --S: var(--font-casi-serif), 'Instrument Serif', Georgia, serif;
          --M: var(--font-casi-mono), 'JetBrains Mono', ui-monospace, monospace;

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
          padding: 28px 40px;
          flex-shrink: 0;
        }
        @media (max-width: 640px) { .nav { padding: 22px 22px; } }
        .nav-logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
        .nav-r { display: flex; align-items: center; gap: 18px; }
        .stamp {
          font-family: var(--S); font-style: italic; font-size: 17px;
          color: var(--type-2); display: flex; align-items: center; gap: 10px;
        }
        .stamp::before {
          content: ''; width: 8px; height: 8px; border-radius: 50%;
          background: var(--accent); animation: blink 1.6s ease-out infinite;
        }
        @keyframes blink {
          0%   { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent) 55%, transparent); }
          100% { box-shadow: 0 0 0 9px color-mix(in oklab, var(--accent)  0%, transparent); }
        }
        .stamp .n { color: var(--type); font-style: normal; font-family: var(--H); font-weight: 700; }
        .sep { width: 1px; height: 16px; background: color-mix(in oklab, var(--type) 22%, transparent); }
        .login-link {
          font-family: var(--S); font-style: italic; font-size: 17px; color: var(--type);
          border-bottom: 1.5px solid color-mix(in oklab, var(--type) 30%, transparent);
          padding-bottom: 1px; text-decoration: none; white-space: nowrap;
        }
        @media (max-width: 540px) {
          .sep { display: none; }
          .stamp, .stamp .n, .login-link { font-size: 15px; }
        }

        /* HEAD */
        .head {
          padding: 0 40px 48px;
          border-bottom: 1px solid color-mix(in oklab, var(--type) 10%, transparent);
        }
        @media (max-width: 640px) { .head { padding: 0 22px 36px; } }
        .eyebrow {
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--type-2);
          margin-bottom: 12px;
        }
        h1 {
          font-family: var(--H);
          font-weight: 800;
          font-size: clamp(52px, 8vw, 84px);
          letter-spacing: -0.035em;
          line-height: 0.95;
          color: var(--type);
          font-variation-settings: 'opsz' 56;
        }
        h1 :global(em) {
          font-family: var(--S);
          font-style: italic;
          font-weight: 400;
          color: var(--ink);
          font-size: 0.94em;
          letter-spacing: -0.015em;
        }

        /* SEARCH INPUT */
        .search-wrap {
          margin-top: 32px;
          position: relative;
          max-width: 560px;
        }
        .search-icon {
          position: absolute;
          left: 22px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 20px;
          color: var(--type-2);
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          padding: 16px 22px 16px 48px;
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
