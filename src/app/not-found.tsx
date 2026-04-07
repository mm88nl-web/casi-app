"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function NotFound() {
  const [liveCount, setLiveCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_live', true);
      setLiveCount(count || 0);
    };
    load();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <h1 className="text-8xl font-black italic tracking-tighter text-white/10 mb-2">404</h1>
        <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-3">Page not found</h2>
        <p className="text-gray-500 text-sm font-mono mb-8">This page doesn't exist or the streamer hasn't signed up yet.</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="/" className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black px-6 py-3 rounded-xl uppercase tracking-widest text-xs transition-all">
            ← Home
          </a>
          <a href="/search" className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-6 py-3 rounded-xl uppercase tracking-widest text-xs transition-all">
            {liveCount > 0 ? `${liveCount} streams live →` : 'Browse streams →'}
          </a>
        </div>

        <p className="text-gray-700 font-mono text-xs mt-8">
          Are you a streamer? <a href="/signup" className="text-gray-500 hover:text-white transition-colors">Sign up here</a>
        </p>
      </div>
    </div>
  );
}
