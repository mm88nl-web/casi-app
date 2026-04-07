"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useParams } from 'next/navigation';

export default function StreamerProfile() {
  const params = useParams();
  const username = params?.username as string;
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const supabase = createClient();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();
      if (!data) setNotFound(true);
      else setProfile(data);
      setLoading(false);
    };
    load();
  }, [username, supabase]);

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <p className="text-cyan-500 font-mono text-sm tracking-widest animate-pulse">LOADING...</p>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-4xl font-black italic uppercase tracking-tighter mb-3">CASI</h1>
        <p className="text-gray-500 font-mono text-sm mb-6">Streamer @{username} not found</p>
        <a href="/search" className="text-cyan-400 font-mono text-xs hover:underline uppercase tracking-widest">Browse streamers →</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <a href="/" className="text-2xl font-black italic tracking-tighter uppercase">Casi</a>
        <a href="/search" className="text-[10px] font-mono text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Browse streams</a>
      </nav>

      <main className="max-w-2xl mx-auto p-8">
        {/* Profile header */}
        <div className="flex items-start gap-6 mb-8">
          <div className="w-20 h-20 rounded-full border border-white/10 overflow-hidden bg-white/5 flex-shrink-0 flex items-center justify-center">
            {profile.avatar_url
              ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt={profile.display_name || username} />
              : <span className="text-3xl">👤</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-2xl font-black">{profile.display_name || username}</h1>
              {profile.is_live && (
                <span className="flex items-center gap-1.5 bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Live now
                </span>
              )}
            </div>
            <p className="text-gray-500 font-mono text-xs mb-2">@{username}</p>
            {profile.bio && <p className="text-gray-300 text-sm leading-relaxed">{profile.bio}</p>}
          </div>
        </div>

        {/* CTA */}
        <div className={`rounded-2xl p-6 border mb-6 ${profile.is_live ? 'bg-cyan-500/5 border-cyan-500/30' : 'bg-white/5 border-white/10'}`}>
          {profile.is_live ? (
            <div className="text-center">
              <p className="text-cyan-400 font-black text-lg mb-1">🔴 Streaming now</p>
              <p className="text-gray-500 text-sm font-mono mb-4">Rent a beam slot and appear on their stream</p>
              <a href={`/overlay?s=${username}`}
                className="inline-block bg-cyan-500 hover:bg-cyan-400 text-black font-black px-8 py-3 rounded-xl uppercase tracking-widest transition-all text-sm">
                Watch &amp; Rent a Slot →
              </a>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-gray-400 font-black text-lg mb-1">Currently offline</p>
              <p className="text-gray-600 text-sm font-mono mb-4">Check back when they go live to rent a beam slot</p>
              <a href={`/overlay?s=${username}`}
                className="inline-block bg-white/10 hover:bg-white/20 text-white font-black px-8 py-3 rounded-xl uppercase tracking-widest transition-all text-sm">
                Open Overlay
              </a>
            </div>
          )}
        </div>

        {/* Share */}
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">Share this page</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono text-gray-400 truncate">
              {origin}/s/{username}
            </code>
            <button onClick={() => navigator.clipboard.writeText(`${origin}/s/${username}`)}
              className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase transition-all whitespace-nowrap">
              Copy
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
