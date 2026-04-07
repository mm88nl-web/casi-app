"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export default function ProfileEditPage() {
  const [profile, setProfile] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarValid, setAvatarValid] = useState(false);
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
    }).eq('id', profile.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <p className="text-cyan-500 font-mono text-sm tracking-widest animate-pulse">LOADING...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-white text-[10px] font-mono uppercase tracking-widest transition-colors">← Back to studio</button>
        </div>
        <h1 className="text-lg font-black italic tracking-tighter uppercase">Edit Profile</h1>
        <a href={`/s/${profile?.username}`} target="_blank" rel="noopener noreferrer"
          className="text-[10px] font-mono text-purple-400 hover:text-purple-300 uppercase tracking-widest transition-colors hidden sm:block">
          View public →
        </a>
      </nav>

      <main className="max-w-lg mx-auto px-4 sm:px-8 py-8">
        <form onSubmit={handleSave} className="space-y-6">

          {/* Avatar */}
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-full border-2 border-dashed border-white/20 overflow-hidden flex-shrink-0 flex items-center justify-center bg-white/5">
              {avatarValid && avatarUrl
                ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
                : <span className="text-4xl">👤</span>}
            </div>
            <div className="flex-1 w-full">
              <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Avatar URL</label>
              <input type="text" value={avatarUrl}
                onChange={(e) => { setAvatarUrl(e.target.value); setAvatarValid(false); }}
                placeholder="https://your-image.png"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors placeholder:text-gray-700" />
              {avatarUrl && <img src={avatarUrl} className="hidden" alt="" onLoad={() => setAvatarValid(true)} onError={() => setAvatarValid(false)} />}
              {avatarUrl && !avatarValid && <p className="text-red-400 text-xs font-mono mt-1">Image not loading</p>}
              {avatarValid && <p className="text-cyan-400 text-xs font-mono mt-1">✓ Looks good</p>}
            </div>
          </div>

          {/* Username (read only) */}
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Username <span className="text-gray-600 normal-case font-normal">— cannot be changed</span></label>
            <div className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-500 font-mono">@{profile?.username}</div>
          </div>

          {/* Display name */}
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Display name</label>
            <input type="text" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={profile?.username} maxLength={32}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors" />
            <p className="text-[9px] font-mono text-gray-600 mt-1">Shown on your public profile and search results</p>
          </div>

          {/* Bio */}
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)}
              placeholder="What do you stream? Tell viewers about yourself..."
              rows={4} maxLength={160}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors resize-none placeholder:text-gray-700" />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[9px] font-mono text-gray-600">Shown on your public profile</p>
              <p className="text-[9px] font-mono text-gray-600">{bio.length}/160</p>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs font-mono">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => router.push('/admin')}
              className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 font-black py-3 rounded-xl uppercase tracking-widest transition-all text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`flex-1 font-black py-3 rounded-xl uppercase tracking-widest transition-all text-sm ${saved ? 'bg-green-500 text-black' : 'bg-cyan-500 hover:bg-cyan-400 text-black disabled:bg-gray-800 disabled:text-gray-600'}`}>
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save changes'}
            </button>
          </div>
        </form>

        {/* Public profile preview */}
        <div className="mt-8 p-4 bg-white/3 border border-white/8 rounded-2xl">
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-3">Public profile preview</p>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden bg-white/5 flex-shrink-0 flex items-center justify-center">
              {avatarValid && avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" /> : <span className="text-xl">👤</span>}
            </div>
            <div>
              <p className="font-black text-white">{displayName || profile?.username}</p>
              <p className="text-gray-500 font-mono text-xs">@{profile?.username}</p>
              {bio && <p className="text-gray-400 text-xs mt-1 leading-relaxed">{bio}</p>}
            </div>
          </div>
          <a href={`/s/${profile?.username}`} target="_blank" rel="noopener noreferrer"
            className="inline-block mt-3 text-[10px] font-mono text-purple-400 hover:text-purple-300 uppercase tracking-widest transition-colors">
            View live page →
          </a>
        </div>
      </main>
    </div>
  );
}
