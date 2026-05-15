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
  ink_color: string | null;
  theme_color: string | null;
};

export default function BrowsePage() {
  const supabase = createClient();
  const [live, setLive] = useState<LiveProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, bio, ink_color, theme_color')
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
          <div className="b-empty-state">
            <div className="b-empty-tag">Off-air</div>
            <h2 className="b-empty-h">No one&apos;s live right now.</h2>
            <p className="b-empty-p">
              CASI is live whenever a streamer flips their is-live switch in Studio.
              Be the first to broadcast.
            </p>
            <Link href="/studio" className="b-empty-cta">
              Go live yourself <span>→</span>
            </Link>
          </div>
        ) : (
          <div className="b-grid">
            {live.map((p) => {
              // Streamer's brand color drives the card's hero band so each tile
              // feels like part of THEIR space. Falls back to ink if they haven't
              // picked one. theme_color is the legacy v7 column; ink_color is v9.
              const accent = p.ink_color || p.theme_color || null;
              const initial = (p.display_name || p.username).charAt(0).toUpperCase();
              return (
                <Link
                  key={p.username}
                  href={`/overlay?s=${p.username}`}
                  className="b-card"
                  style={accent ? ({ '--card-ink': accent } as React.CSSProperties) : undefined}
                >
                  <div className="b-card-hero">
                    <span className="b-card-live">
                      <span className="b-card-live-dot" />
                      Live
                    </span>
                    <div className="b-card-avatar">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt="" />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                  </div>
                  <div className="b-card-body">
                    <div className="b-card-name">{p.display_name || p.username}</div>
                    <div className="b-card-handle">@{p.username}</div>
                    {p.bio ? <p className="b-card-bio">{p.bio}</p> : <p className="b-card-bio b-card-bio-empty">No bio yet.</p>}
                  </div>
                  <div className="b-card-foot">
                    <span className="b-card-cta">Book a slot</span>
                    <span className="b-card-arrow">→</span>
                  </div>
                </Link>
              );
            })}
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

        /* Loading-text placeholder */
        .b-empty {
          padding: 64px 0;
          font-family: var(--M);
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-3);
          text-align: center;
        }

        /* Zero-streamers empty state — designed to feel like a deliberate
           page state, not a broken render. The earlier inline 'Nobody's live'
           collapsed to a one-line message that read like an error. */
        .b-empty-state {
          max-width: 540px;
          margin: 48px 0 64px;
          padding: 40px 0;
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
        }
        .b-empty-tag {
          display: inline-block;
          font-family: var(--M);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--ink);
          padding: 3px 9px;
          border: 1px solid var(--ink);
          margin-bottom: 20px;
        }
        .b-empty-h {
          font-family: var(--H);
          font-weight: 700;
          font-size: clamp(28px, 4vw, 40px);
          letter-spacing: -0.025em;
          line-height: 1.05;
          color: var(--text);
        }
        .b-empty-p {
          margin-top: 16px;
          font-size: 15px;
          line-height: 1.55;
          color: var(--text-2);
        }
        .b-empty-cta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-top: 24px;
          padding: 13px 22px;
          background: var(--ink);
          color: var(--on-ink);
          font-family: var(--M);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          text-decoration: none;
          border: 1px solid var(--ink);
          transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
          position: relative;
        }
        .b-empty-cta :global(span) {
          font-size: 14px;
          transition: transform 0.16s ease;
        }
        .b-empty-cta:hover {
          background: transparent;
          color: var(--ink);
        }
        .b-empty-cta:hover :global(span) { transform: translateX(4px); }
        .b-empty-cta:active { transform: translateY(1px); }

        /* Grid: each tile is capped to a sensible card width (360px max,
           280px min). Critically uses justify-content: start so a single
           streamer renders as a single 360px tile in the top-left, NOT
           stretched to the full viewport. As streamers join the grid fills
           left-to-right and wraps cleanly. */
        .b-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 360px));
          gap: 16px;
          justify-content: start;
        }

        /* Card — three vertical zones (hero / body / foot) with the
           streamer's accent driving the hero band so each card feels like
           an extension of THEIR space, not a stamped template. Falls back
           to default --ink when the streamer hasn't picked a brand color. */
        .b-card {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--line);
          background: var(--surf);
          text-decoration: none;
          color: inherit;
          transition: transform 0.14s, border-color 0.14s;
          overflow: hidden;
        }
        .b-card:hover {
          transform: translateY(-2px);
          border-color: var(--card-ink, var(--ink));
        }

        /* Hero band — colored fill, oversized avatar overlapping the bottom
           edge so it bleeds into the body. Gives the card immediate visual
           identity even before reading the name. */
        .b-card-hero {
          position: relative;
          aspect-ratio: 16 / 9;
          background:
            radial-gradient(
              circle at 30% 30%,
              color-mix(in oklab, var(--card-ink, var(--ink)) 65%, transparent),
              color-mix(in oklab, var(--card-ink, var(--ink)) 20%, transparent) 70%
            ),
            var(--paper);
          border-bottom: 1px solid var(--line);
        }
        .b-card-live {
          position: absolute;
          top: 12px;
          right: 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 9px;
          background: var(--paper);
          color: var(--text);
          font-family: var(--M);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          border: 1px solid var(--line);
        }
        .b-card-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--card-ink, var(--ink));
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--card-ink, var(--ink)) 25%, transparent);
          animation: livePulse 1.8s ease-in-out infinite;
        }
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 0 3px color-mix(in oklab, var(--card-ink, var(--ink)) 25%, transparent); }
          50%      { box-shadow: 0 0 0 5px color-mix(in oklab, var(--card-ink, var(--ink)) 12%, transparent); }
        }
        .b-card-avatar {
          position: absolute;
          left: 18px;
          bottom: -22px;
          width: 64px;
          height: 64px;
          background: var(--paper);
          color: var(--card-ink, var(--ink));
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--H);
          font-weight: 800;
          font-size: 28px;
          letter-spacing: -0.04em;
          border: 2px solid var(--paper);
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        }
        .b-card-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .b-card-body {
          padding: 34px 20px 18px;
          flex: 1;
        }
        .b-card-name {
          font-family: var(--H);
          font-weight: 700;
          font-size: 20px;
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
          margin-top: 14px;
          line-height: 1.5;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .b-card-bio-empty { color: var(--text-4); font-style: italic; }

        /* Footer reads as a real CTA button when the card is hovered: the
           whole strip fills with the streamer's ink color, the text inverts
           to --on-ink, the arrow slides. At rest it's a quiet 'Book a slot'
           label on the surf-2 strip so the card doesn't shout from across
           the page. Smooth color-fill transition (180ms) so it feels intentional. */
        .b-card-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 20px;
          border-top: 1px solid var(--line);
          background: var(--surf-2);
          transition: background 0.18s ease, border-top-color 0.18s ease;
          position: relative;
        }
        .b-card:hover .b-card-foot {
          background: var(--card-ink, var(--ink));
          border-top-color: var(--card-ink, var(--ink));
        }
        .b-card-cta {
          font-family: var(--M);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-3);
          transition: color 0.18s ease;
        }
        .b-card:hover .b-card-cta { color: var(--on-ink); }
        .b-card-arrow {
          font-family: var(--M);
          font-size: 16px;
          color: var(--text-3);
          transition: color 0.18s ease, transform 0.18s ease;
        }
        .b-card:hover .b-card-arrow {
          color: var(--on-ink);
          transform: translateX(4px);
        }

        /* Mobile: stretch cards to full width below 480px since side-by-side
           tiles get crammed. Keep the same 360px cap on tablet+. */
        @media (max-width: 480px) {
          .b-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
