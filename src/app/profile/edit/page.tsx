"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

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

const THEME_PRESETS = [
  { name: 'Casi Orange',   color: '#F58220' },
  { name: 'Twitch Purple', color: '#9146FF' },
  { name: 'Cyber Cyan',    color: '#06b6d4' },
  { name: 'YouTube Red',   color: '#FF0000' },
  { name: 'Matrix Green',  color: '#4ade80' },
  { name: 'Kick Green',    color: '#53FC18' },
  { name: 'Rose Pink',     color: '#f472b6' },
  { name: 'Gold',          color: '#facc15' },
  { name: 'Pure White',    color: '#e8e8e8' },
];

export default function ProfileEditPage() {
  const [profile, setProfile] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarValid, setAvatarValid] = useState(false);
  const [themeColor, setThemeColor] = useState('#F58220');
  const [customColor, setCustomColor] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (prof) {
        setProfile(prof);
        setDisplayName(prof.display_name || prof.username || '');
        setBio(prof.bio || '');
        setAvatarUrl(prof.avatar_url || '');
        if (prof.avatar_url) setAvatarValid(true);
        if (prof.theme_color) setThemeColor(prof.theme_color);
      }
      setLoading(false);
    };
    load();
  }, [router, supabase]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('profiles').update({
      display_name: displayName || profile.username,
      bio: bio || null,
      avatar_url: avatarValid ? avatarUrl : null,
      theme_color: themeColor,
    }).eq('id', profile.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tc = themeColor; // shorthand for inline use

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#F58220', animation: 'pulse 1.5s infinite' }}>Loading…</div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

        .pe { min-height: 100vh; background: #050505; color: #e8e8e8; font-family: 'Syne', sans-serif; }
        .pe::before {
          content: ''; position: fixed; inset: 0;
          background-image: linear-gradient(rgba(245,130,32,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(245,130,32,0.02) 1px, transparent 1px);
          background-size: 64px 64px; pointer-events: none; z-index: 0;
        }

        .pe-nav { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; padding: 0 40px; height: 64px; border-bottom: 1px solid #111; background: rgba(5,5,5,0.94); backdrop-filter: blur(20px); }
        .pe-nav-left { display: flex; align-items: center; gap: 16px; }
        .pe-back { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #555; text-decoration: none; transition: color .2s; }
        .pe-back:hover { color: #e8e8e8; }
        .pe-nav-title { font-size: 16px; font-weight: 700; color: #e8e8e8; }
        .pe-view-link { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #F58220; text-decoration: none; transition: color .2s; }
        .pe-view-link:hover { color: #ff9030; }

        .pe-body { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; padding: 48px 40px; }

        .pe-field { margin-bottom: 24px; }
        .pe-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #555; display: block; margin-bottom: 8px; }
        .pe-input { width: 100%; background: #0a0a0a; border: 1px solid #1c1c1c; border-radius: 10px; padding: 13px 16px; font-size: 14px; color: #e8e8e8; outline: none; font-family: 'Syne', sans-serif; transition: border-color .2s; }
        .pe-input::placeholder { color: #333; }
        .pe-input:focus { border-color: rgba(245,130,32,0.35); }
        .pe-hint { font-family: 'DM Mono', monospace; font-size: 10px; margin-top: 6px; color: #444; }
        .pe-hint.ok  { color: #4ade80; }
        .pe-hint.err { color: #f87171; }

        .pe-avatar-row { display: flex; align-items: center; gap: 16px; }
        .pe-avatar { width: 64px; height: 64px; border-radius: 50%; border: 1px dashed #222; background: #0a0a0a; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 26px; }

        .pe-readonly { background: rgba(0,0,0,0.3); border: 1px solid #111; border-radius: 10px; padding: 13px 16px; font-family: 'DM Mono', monospace; font-size: 13px; color: #444; }

        /* Theme picker */
        .theme-presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .theme-swatch { width: 36px; height: 36px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all .15s; flex-shrink: 0; }
        .theme-swatch:hover { transform: scale(1.12); }
        .theme-swatch.active { border-color: white; box-shadow: 0 0 0 3px rgba(255,255,255,0.15); }
        .theme-custom-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
        .theme-preview-bar { height: 3px; border-radius: 2px; margin-top: 12px; transition: background .3s; }

        .pe-actions { display: flex; gap: 10px; padding-top: 8px; }
        .pe-btn { flex: 1; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3px; padding: 14px; border-radius: 10px; border: none; cursor: pointer; transition: all .2s; }
        .pe-btn.cancel { background: rgba(255,255,255,0.04); color: #666; border: 1px solid #1c1c1c !important; }
        .pe-btn.cancel:hover { background: rgba(255,255,255,0.08); color: #e8e8e8; }
        .pe-btn.save { color: #050505; }
        .pe-btn.save:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        .pe-btn.save:disabled { background: #1c1c1c !important; color: #444 !important; cursor: not-allowed; }
        .pe-btn.saved { background: #4ade80 !important; color: #050505 !important; }

        .pe-error { background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 10px 14px; font-family: 'DM Mono', monospace; font-size: 11px; color: #f87171; margin-bottom: 16px; }

        /* Preview card */
        .pe-preview { background: #080808; border: 1px solid #161616; border-radius: 14px; padding: 20px; margin-top: 32px; transition: border-color .3s; }
        .pe-preview-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #444; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .pe-preview-label::before { content: ''; display: block; width: 16px; height: 1px; background: #333; }
        .pe-preview-inner { display: flex; align-items: center; gap: 14px; }
        .pe-preview-avatar { width: 48px; height: 48px; border-radius: 50%; border: 1px solid #1c1c1c; overflow: hidden; background: #0d0d0d; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; }
        .pe-preview-name { font-size: 16px; font-weight: 700; color: #e8e8e8; margin-bottom: 2px; }
        .pe-preview-handle { font-family: 'DM Mono', monospace; font-size: 11px; color: #444; }
        .pe-preview-bio { font-size: 13px; color: #484848; line-height: 1.6; margin-top: 8px; }

        @media (max-width: 640px) {
          .pe-nav { padding: 0 20px; height: 52px; }
          .pe-body { padding: 32px 20px; }
          .pe-actions { flex-direction: column; }
        }
      `}</style>

      <div className="pe">
        <nav className="pe-nav">
          <div className="pe-nav-left">
            <a href="/admin" className="pe-back">← Studio</a>
            <span style={{ color: '#222' }}>|</span>
            <span className="pe-nav-title">Edit profile</span>
          </div>
          <a href={`/s/${profile?.username}`} target="_blank" rel="noopener noreferrer" className="pe-view-link">
            View public page →
          </a>
        </nav>

        <div className="pe-body">
          <form onSubmit={handleSave}>

            {/* Avatar */}
            <div className="pe-field">
              <label className="pe-label">Avatar</label>
              <div className="pe-avatar-row">
                <div className="pe-avatar" style={{ border: `2px solid ${tc}30` }}>
                  {avatarValid && avatarUrl
                    ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : '👤'}
                </div>
                <input type="text" value={avatarUrl} placeholder="https://your-image.png"
                  className="pe-input" style={{ flex: 1 }}
                  onChange={(e) => { setAvatarUrl(e.target.value); setAvatarValid(false); }} />
                {avatarUrl && <img src={avatarUrl} style={{ display: 'none' }} alt="" onLoad={() => setAvatarValid(true)} onError={() => setAvatarValid(false)} />}
              </div>
              {avatarUrl && (
                <div className={`pe-hint ${avatarValid ? 'ok' : 'err'}`}>
                  {avatarValid ? '✓ Image loaded' : 'Image not loading — check URL'}
                </div>
              )}
            </div>

            {/* Username — readonly */}
            <div className="pe-field">
              <label className="pe-label">Username <span style={{ color: '#333', textTransform: 'none', fontSize: 9 }}>— cannot be changed</span></label>
              <div className="pe-readonly">@{profile?.username}</div>
            </div>

            {/* Display name */}
            <div className="pe-field">
              <label className="pe-label">Display name</label>
              <input type="text" value={displayName} placeholder={profile?.username}
                maxLength={32} className="pe-input"
                onChange={(e) => setDisplayName(e.target.value)} />
            </div>

            {/* Bio */}
            <div className="pe-field">
              <label className="pe-label">Bio</label>
              <textarea value={bio} placeholder="What do you stream? Tell viewers about yourself…"
                rows={4} maxLength={160}
                style={{ width: '100%', background: '#0a0a0a', border: '1px solid #1c1c1c', borderRadius: 10, padding: '13px 16px', fontSize: 14, color: '#e8e8e8', outline: 'none', fontFamily: "'Syne', sans-serif", resize: 'none', transition: 'border-color .2s' }}
                onFocus={(e) => e.target.style.borderColor = `${tc}50`}
                onBlur={(e) => e.target.style.borderColor = '#1c1c1c'}
                onChange={(e) => setBio(e.target.value)} />
              <div className="pe-hint" style={{ textAlign: 'right' }}>{bio.length}/160</div>
            </div>

            {/* ── THEME COLOR ── */}
            <div className="pe-field">
              <label className="pe-label">Stream theme color</label>
              <div className="theme-presets">
                {THEME_PRESETS.map(p => (
                  <button
                    key={p.color}
                    type="button"
                    title={p.name}
                    className={`theme-swatch ${themeColor === p.color ? 'active' : ''}`}
                    style={{ background: p.color }}
                    onClick={() => { setThemeColor(p.color); setCustomColor(''); }}
                  />
                ))}
              </div>
              {/* Custom hex input */}
              <div className="theme-custom-row">
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: themeColor,
                  border: '1px solid #333', flexShrink: 0,
                  boxShadow: `0 0 12px ${themeColor}40`
                }} />
                <input
                  type="text"
                  value={customColor || themeColor}
                  placeholder="#F58220"
                  maxLength={7}
                  className="pe-input"
                  style={{ flex: 1, fontFamily: "'DM Mono', monospace", fontSize: 13 }}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomColor(v);
                    if (/^#[0-9A-Fa-f]{6}$/.test(v)) setThemeColor(v);
                  }}
                />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#444', whiteSpace: 'nowrap' }}>custom hex</span>
              </div>
              <div className="theme-preview-bar" style={{ background: `linear-gradient(90deg, ${tc}, ${tc}40)` }} />
              <div className="pe-hint">Viewers see this color on your overlay page and public profile</div>
            </div>

            {error && <div className="pe-error">{error}</div>}

            <div className="pe-actions">
              <button type="button" className="pe-btn cancel" onClick={() => router.push('/admin')}>Cancel</button>
              <button type="submit" disabled={saving} className={`pe-btn save ${saved ? 'saved' : ''}`}
                style={{ background: saved ? '#4ade80' : tc }}>
                {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save changes'}
              </button>
            </div>
          </form>

          {/* Live preview */}
          <div className="pe-preview" style={{ borderColor: `${tc}20` }}>
            <div className="pe-preview-label">Preview — how viewers will see you</div>
            <div className="pe-preview-inner">
              <div className="pe-preview-avatar" style={{ border: `2px solid ${tc}40` }}>
                {avatarValid && avatarUrl
                  ? <img src={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : '👤'}
              </div>
              <div>
                <div className="pe-preview-name">{displayName || profile?.username}</div>
                <div className="pe-preview-handle" style={{ color: tc }}>@{profile?.username}</div>
              </div>
            </div>
            {bio && <div className="pe-preview-bio">{bio}</div>}
            {/* Mini overlay preview */}
            <div style={{ marginTop: 16, background: '#050505', border: `1px solid ${tc}20`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, border: `1.5px dashed ${tc}60`, background: `${tc}08`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✦</div>
              <div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: tc, letterSpacing: 1, textTransform: 'uppercase' }}>Beam slot</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: tc }}>$5/min</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ background: tc, borderRadius: 12, padding: '4px 12px', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 10, textTransform: 'uppercase', color: '#050505' }}>Rent →</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
