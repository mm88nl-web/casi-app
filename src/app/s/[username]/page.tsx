"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useParams } from 'next/navigation';

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

export default function StreamerProfile() {
  const params = useParams();
  const username = params?.username as string;
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('username', username).single();
      if (!data) setNotFound(true);
      else setProfile(data);
      setLoading(false);
    };
    load();
  }, [username, supabase]);

  const copyLink = () => {
    navigator.clipboard.writeText(`${origin}/s/${username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#F58220', animation: 'pulse 1.5s infinite' }}>Loading…</div>
    </div>
  );

  if (notFound) return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&display=swap'); *{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Syne', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <Logo scale={0.5} />
          <div style={{ fontSize: 22, fontWeight: 800, color: '#F58220', letterSpacing: -0.5, marginTop: 16, marginBottom: 8 }}>casi</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#555', marginBottom: 24 }}>@{username} not found</div>
          <a href="/search" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#06b6d4', textDecoration: 'none', letterSpacing: 1, textTransform: 'uppercase' }}>Browse streamers →</a>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

        .pp { min-height: 100vh; background: #050505; color: #e8e8e8; font-family: 'Syne', sans-serif; }
        .pp::before {
          content: ''; position: fixed; inset: 0;
          background-image: linear-gradient(rgba(245,130,32,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(245,130,32,0.02) 1px, transparent 1px);
          background-size: 64px 64px; pointer-events: none; z-index: 0;
        }

        .pp-nav { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; padding: 0 40px; height: 64px; border-bottom: 1px solid #111; background: rgba(5,5,5,0.94); backdrop-filter: blur(20px); }
        .pp-nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .pp-nav-wm { font-size: 20px; font-weight: 800; color: #F58220; letter-spacing: -0.5px; }
        .pp-nav-link { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #555; text-decoration: none; transition: color .2s; }
        .pp-nav-link:hover { color: #e8e8e8; }

        .pp-body { position: relative; z-index: 1; max-width: 680px; margin: 0 auto; padding: 56px 40px; }

        /* HERO */
        .pp-hero { display: flex; align-items: flex-start; gap: 24px; margin-bottom: 40px; padding-bottom: 40px; border-bottom: 1px solid #0d0d0d; }
        .pp-avatar { width: 80px; height: 80px; border-radius: 50%; border: 1px solid #1c1c1c; overflow: hidden; background: #0d0d0d; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 32px; }
        .pp-name { font-size: clamp(22px, 3vw, 30px); font-weight: 800; letter-spacing: -1px; color: #f0f0f0; margin-bottom: 4px; }
        .pp-handle { font-family: 'DM Mono', monospace; font-size: 12px; color: #444; margin-bottom: 12px; }
        .live-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #f87171; animation: blink 1.5s infinite; }
        .pp-bio { font-size: 14px; color: #585858; line-height: 1.7; }

        /* CTA CARD */
        .pp-cta { border-radius: 14px; padding: 28px 32px; margin-bottom: 16px; }
        .pp-cta.live { background: rgba(6,182,212,0.05); border: 1px solid rgba(6,182,212,0.2); }
        .pp-cta.offline { background: #080808; border: 1px solid #161616; }
        .pp-cta-title { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px; }
        .pp-cta-sub { font-family: 'DM Mono', monospace; font-size: 11px; color: #555; margin-bottom: 20px; letter-spacing: 0.5px; }
        .pp-btn { display: inline-block; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3px; padding: 14px 28px; border-radius: 10px; text-decoration: none; transition: all .2s; }
        .pp-btn.primary { background: #06b6d4; color: #050505; }
        .pp-btn.primary:hover { background: #08caf0; transform: translateY(-1px); }
        .pp-btn.secondary { background: rgba(255,255,255,0.05); color: #888; border: 1px solid #1c1c1c; }
        .pp-btn.secondary:hover { background: rgba(255,255,255,0.08); color: #e8e8e8; }

        /* SHARE */
        .pp-share { background: #080808; border: 1px solid #161616; border-radius: 14px; padding: 20px 24px; }
        .pp-share-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #444; margin-bottom: 12px; }
        .pp-share-row { display: flex; align-items: center; gap: 10px; }
        .pp-share-url { flex: 1; background: rgba(0,0,0,0.4); border: 1px solid #111; border-radius: 8px; padding: '10px 14px'; font-family: 'DM Mono', monospace; font-size: 11px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 10px 14px; }
        .pp-copy-btn { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 12px; text-transform: uppercase; padding: 10px 18px; border-radius: 8px; border: 1px solid #222; background: rgba(255,255,255,0.04); color: #888; cursor: pointer; transition: all .2s; white-space: nowrap; }
        .pp-copy-btn:hover { background: rgba(255,255,255,0.08); color: #e8e8e8; }
        .pp-copy-btn.copied { background: rgba(74,222,128,0.1); border-color: rgba(74,222,128,0.25); color: #4ade80; }

        @media (max-width: 640px) {
          .pp-nav { padding: 0 20px; }
          .pp-body { padding: 32px 20px; }
          .pp-hero { flex-direction: column; gap: 16px; }
          .pp-cta { padding: 24px 20px; }
        }
      `}</style>

      <div className="pp">
        <nav className="pp-nav">
          <a href="/" className="pp-nav-logo">
            <Logo scale={0.28} />
            <span className="pp-nav-wm">casi</span>
          </a>
          <a href="/search" className="pp-nav-link">Browse streams</a>
        </nav>

        <div className="pp-body">
          {/* Profile hero */}
          <div className="pp-hero">
            <div className="pp-avatar">
              {profile.avatar_url
                ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                : '👤'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pp-name">{profile.display_name || username}</div>
              <div className="pp-handle">@{username}</div>
              {profile.is_live && (
                <div className="live-badge">
                  <span className="live-dot" />
                  Live now
                </div>
              )}
              {profile.bio && <div className="pp-bio">{profile.bio}</div>}
            </div>
          </div>

          {/* CTA */}
          <div className={`pp-cta ${profile.is_live ? 'live' : 'offline'}`}>
            {profile.is_live ? (
              <>
                <div className="pp-cta-title" style={{ color: '#06b6d4' }}>🔴 Streaming right now</div>
                <div className="pp-cta-sub">Rent a beam slot and appear live on their stream</div>
                <a href={`/overlay?s=${username}`} className="pp-btn primary">Watch &amp; rent a slot →</a>
              </>
            ) : (
              <>
                <div className="pp-cta-title" style={{ color: '#e8e8e8' }}>Currently offline</div>
                <div className="pp-cta-sub">Check back when they go live to rent a beam slot</div>
                <a href={`/overlay?s=${username}`} className="pp-btn secondary">Open overlay</a>
              </>
            )}
          </div>

          {/* Share */}
          <div className="pp-share">
            <div className="pp-share-label">Share this page</div>
            <div className="pp-share-row">
              <div className="pp-share-url">{origin}/s/{username}</div>
              <button onClick={copyLink} className={`pp-copy-btn ${copied ? 'copied' : ''}`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
