"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function SearchPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('profiles').select('username, display_name, bio, avatar_url, is_live')
        .order('is_live', { ascending: false }).order('username', { ascending: true });
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
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/10">
        <a href="/" className="text-xl sm:text-2xl font-black italic tracking-tighter uppercase">Casi</a>
        <p className="text-[10px] font-mono uppercase tracking-widest">
          {liveCount > 0
            ? <span className="text-red-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />{liveCount} live</span>
            : <span className="text-gray-600">No streams live</span>}
        </p>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter mb-5 sm:mb-6">Find Streamers</h1>

        <div className="flex items-center gap-2 sm:gap-3 mb-6">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..." autoFocus
              className="w-full bg-white/5 border border-white/10 pl-9 pr-4 py-2.5 sm:py-3 rounded-xl text-sm text-white outline-none focus:border-cyan-500/50 transition-colors placeholder:text-gray-700" />
          </div>
          <button onClick={() => setLiveOnly(!liveOnly)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap touch-manipulation ${liveOnly ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${liveOnly ? 'bg-red-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="hidden sm:inline">Live only</span>
            <span className="sm:hidden">Live</span>
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse h-28" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 sm:py-24 border border-dashed border-white/10 rounded-2xl">
            <p className="text-gray-600 font-mono text-sm">
              {liveOnly ? 'No streamers live right now' : query ? `No results for "${query}"` : 'No streamers yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(p => (
              <a key={p.username} href={`/s/${p.username}`}
                className="group bg-white/5 border border-white/10 hover:border-white/20 active:bg-white/10 rounded-2xl p-4 sm:p-5 transition-all block touch-manipulation">
                <div className="flex items-start gap-3 mb-2 sm:mb-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/10 overflow-hidden bg-white/5 flex-shrink-0 flex items-center justify-center">
                    {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="text-base sm:text-lg">👤</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-white text-sm truncate">{p.display_name || p.username}</p>
                      {p.is_live && (
                        <span className="flex items-center gap-1 bg-red-500/20 border border-red-500/30 text-red-400 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">
                          <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />Live
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 font-mono text-[10px]">@{p.username}</p>
                  </div>
                </div>
                {p.bio ? <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{p.bio}</p> : <p className="text-gray-700 text-xs italic">No bio yet</p>}
                <p className="text-cyan-500 text-[10px] font-black uppercase tracking-widest mt-2 sm:mt-3">
                  {p.is_live ? 'Watch now →' : 'View profile →'}
                </p>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
