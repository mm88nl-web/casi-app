'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { NavBar, Footer } from '@/components/v9';
type LiveProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export default function BrowsePage() {
  const supabase = createClient();
  const [live, setLive] = useState<LiveProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
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
  }, [supabase]);

  return (
    <main className="casi-v9-browse">
      <NavBar
        liveLabel={live === null ? '— LIVE NOW' : `${live.length} LIVE NOW`}
      />

      <section className="b-head">
        <div className="b-eyebrow">
          <span className="b-eyebrow-rule" />
          <span className="b-eyebrow-tag">Browse</span>
          Live now
        </div>
        <h1 className="b-title">
          Pick a streamer.
          <br />
          <em>Take their screen.</em>
        </h1>
        <p className="b-sub">
          Every streamer below is live right now. Click in to book a slot.
        </p>
      </section>

      <section className="b-body">
        {live === null ? (
          <div className="b-empty">Loading…</div>
        ) : live.length === 0 ? (
          <div className="b-empty">
            Nobody&apos;s live right now. <Link href="/studio">Go live yourself →</Link>
          </div>
        ) : (
          <div className="b-grid">
            {live.map((p) => (
              <Link
                key={p.username}
                href={`/overlay?s=${p.username}`}
                className="b-card"
              >
                <div className="b-card-head">
                  <div className="b-card-avatar">
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt="" />
                    ) : (
                      (p.display_name || p.username).charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="b-card-live">
                    <span className="b-card-live-dot" />
                    Live
                  </span>
                </div>
                <div className="b-card-info">
                  <div className="b-card-name">{p.display_name || p.username}</div>
                  <div className="b-card-handle">@{p.username}</div>
                  {p.bio ? <p className="b-card-bio">{p.bio}</p> : null}
                </div>
                <div className="b-card-foot">
                  <span className="b-card-cta">Book a slot</span>
                  <span className="b-card-arrow">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Footer />

      <style jsx>{`
        .casi-v9-browse {
          background: var(--paper);
          color: var(--text);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .b-head {
          padding: 64px var(--pad) 40px;
          border-bottom: 1px solid var(--line);
        }
        .b-eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--M);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 24px;
        }
        .b-eyebrow-rule { display: block; width: 24px; height: 1px; background: var(--ink); }
        .b-eyebrow-tag {
          padding: 3px 9px;
          border: 1px solid var(--ink);
          color: var(--ink);
          font-size: 9.5px;
          letter-spacing: 0.18em;
        }
        .b-title {
          font-family: var(--H);
          font-weight: 800;
          font-variation-settings: 'opsz' 96;
          font-size: clamp(48px, 7vw, 96px);
          line-height: 0.92;
          letter-spacing: -0.04em;
          color: var(--text);
        }
        .b-title :global(em) {
          font-family: var(--S);
          font-style: italic;
          font-weight: 400;
          color: var(--ink);
          font-size: 0.95em;
          letter-spacing: -0.015em;
        }
        .b-sub {
          margin-top: 20px;
          font-size: 16px;
          color: var(--text-2);
          max-width: 520px;
        }
        .b-body { flex: 1; padding: 32px var(--pad) 80px; }
        .b-empty {
          padding: 48px 0;
          font-family: var(--M);
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-3);
          text-align: center;
        }
        .b-empty :global(a) { color: var(--ink); margin-left: 6px; }
        /* Auto-fill grid: cards sit at ~320-380px regardless of streamer
           count. With 1 streamer you get one tile (not a stretched-full-
           width row), with 6 you get 3 columns on a wide monitor, with 12
           you get 3-4 columns. Portrait monitors still get a sensible
           multi-column layout because cards have a max effective width. */
        .b-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 0;
          border: 1px solid var(--line);
          background: var(--surf);
        }
        .b-card {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 22px 22px 18px;
          border-right: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          text-decoration: none;
          color: inherit;
          transition: background 0.14s;
          min-height: 220px;
        }
        .b-card:hover { background: var(--ink-04); }
        .b-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .b-card-avatar {
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          background: var(--ink);
          color: var(--on-ink);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--H);
          font-weight: 800;
          font-size: 24px;
          letter-spacing: -0.04em;
          overflow: hidden;
        }
        .b-card-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .b-card-info { flex: 1; min-width: 0; }
        .b-card-name {
          font-family: var(--H);
          font-weight: 700;
          font-size: 19px;
          letter-spacing: -0.02em;
          color: var(--text);
          line-height: 1.15;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .b-card-handle {
          font-family: var(--M);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--text-3);
          margin-top: 4px;
        }
        .b-card-bio {
          font-size: 13px;
          color: var(--text-2);
          margin-top: 10px;
          line-height: 1.5;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .b-card-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-top: 14px;
          border-top: 1px solid var(--line);
          margin-top: auto;
        }
        .b-card-cta {
          font-family: var(--M);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-3);
          transition: color 0.14s;
        }
        .b-card:hover .b-card-cta { color: var(--ink); }
        .b-card-live {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 9px;
          background: var(--ink);
          color: var(--on-ink);
          font-family: var(--M);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .b-card-live-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--on-ink);
        }
        .b-card-arrow {
          font-family: var(--M);
          font-size: 16px;
          color: var(--text-3);
          transition: color 0.14s, transform 0.14s;
        }
        .b-card:hover .b-card-arrow {
          color: var(--ink);
          transform: translateX(3px);
        }
      `}</style>
    </main>
  );
}
