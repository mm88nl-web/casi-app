"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// ─── Edit copy here ───────────────────────────────────────────────────
const HEADLINE = "Monetize your stream";
const SUBHEADLINE = "Let viewers rent space on your live stream. They place their image, GIF, or brand on your screen — you get paid per minute.";
const CTA_STREAMER = "Start streaming";
const CTA_VIEWER = "Find a stream";
const STEPS = [
  { icon: "✦", title: "Create a slot", body: "Add beam slots or a full backdrop to your OBS overlay in seconds." },
  { icon: "$", title: "Set your price", body: "Charge per minute or per hour. You set the rate, viewers pay to be seen." },
  { icon: "●", title: "Go live", body: "Viewers request their image, you approve it, it appears on stream instantly." },
];
// ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [liveCount, setLiveCount] = useState(0);
  const [streamerCount, setStreamerCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { count: total } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: live } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_live', true);
      setStreamerCount(total || 0);
      setLiveCount(live || 0);
    };
    load();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <h1 className="text-2xl font-black italic tracking-tighter uppercase">Casi</h1>
        <div className="flex items-center gap-6">
          {liveCount > 0 && (
            <a href="/search" className="flex items-center gap-2 text-[10px] font-mono text-red-400 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {liveCount} live now
            </a>
          )}
          <a href="/search" className="text-[10px] font-mono text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Browse streams</a>
          <a href="/login" className="text-[10px] font-mono text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Sign in</a>
          <a href="/signup" className="bg-cyan-500 hover:bg-cyan-400 text-black text-[10px] font-black px-4 py-2 rounded uppercase tracking-widest transition-all">
            {CTA_STREAMER} →
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 pt-24 pb-20 text-center">
        {streamerCount > 0 && (
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{streamerCount} streamer{streamerCount !== 1 ? 's' : ''} on Casi</span>
          </div>
        )}

        <h2 className="text-6xl sm:text-7xl font-black italic uppercase tracking-tighter leading-none mb-6">
          {HEADLINE}
        </h2>

        <p className="text-gray-400 text-lg max-w-xl mx-auto leading-relaxed mb-10">
          {SUBHEADLINE}
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <a href="/signup"
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-8 py-4 rounded-xl uppercase tracking-widest text-sm transition-all shadow-lg shadow-cyan-500/20">
            {CTA_STREAMER} →
          </a>
          <a href="/search"
            className="bg-white/5 hover:bg-white/10 text-white font-black px-8 py-4 rounded-xl uppercase tracking-widest text-sm transition-all border border-white/10">
            {CTA_VIEWER}
          </a>
        </div>
      </section>

      {/* Visual — stream mockup */}
      <section className="max-w-4xl mx-auto px-8 pb-24">
        <div className="relative aspect-video rounded-2xl border border-white/10 bg-black overflow-hidden shadow-2xl">

          {/* Fake stream background */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900" />

          {/* Streamer silhouette area */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-3/4 bg-gradient-to-t from-gray-700/20 to-transparent rounded-t-full" />

          {/* Beam slot — top left */}
          <div className="absolute top-6 left-6 w-28 h-20 rounded-xl border-2 border-cyan-500/60 bg-cyan-500/10 flex flex-col items-center justify-center shadow-lg shadow-cyan-500/10">
            <span className="text-cyan-400 text-lg mb-1">✦</span>
            <span className="text-[8px] font-mono text-cyan-400/70 uppercase tracking-widest">Beam slot</span>
            <span className="text-[8px] font-black text-cyan-400 mt-0.5">$5/min</span>
          </div>

          {/* Beam slot — top right, occupied */}
          <div className="absolute top-6 right-6 w-28 h-20 rounded-xl border-2 border-white/20 overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-orange-500/40 to-red-500/20 flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 rounded-lg bg-orange-500/30 border border-orange-500/40 mx-auto mb-1 flex items-center justify-center text-lg">🔥</div>
                <span className="text-[8px] font-black text-orange-300">CoolTiger42</span>
              </div>
            </div>
          </div>

          {/* Full backdrop label */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <div className="bg-black/80 backdrop-blur-sm border border-purple-500/40 rounded-full px-4 py-1.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span className="text-[9px] font-mono text-purple-400 uppercase tracking-widest">Full Backdrop — $10/hr</span>
            </div>
          </div>

          {/* Live badge */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Live
          </div>

          {/* Earning ticker */}
          <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-sm border border-green-500/30 rounded-xl px-3 py-2">
            <p className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">Earning</p>
            <p className="text-sm font-black text-green-400">$4.80/min</p>
          </div>
        </div>
        <p className="text-center text-[10px] font-mono text-gray-600 mt-3 uppercase tracking-widest">Your stream, monetized in real time</p>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-8 pb-24">
        <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest text-center mb-12">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <div key={i} className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-black text-lg mb-4">
                {step.icon}
              </div>
              <h3 className="font-black text-white text-lg mb-2">{step.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-2xl mx-auto px-8 pb-24 text-center">
        <div className="bg-white/3 border border-white/8 rounded-2xl p-10">
          <h3 className="text-3xl font-black italic uppercase tracking-tighter mb-3">Ready to start?</h3>
          <p className="text-gray-500 text-sm mb-8">Set up your stream overlay in under 5 minutes.</p>
          <a href="/signup"
            className="inline-block bg-cyan-500 hover:bg-cyan-400 text-black font-black px-10 py-4 rounded-xl uppercase tracking-widest text-sm transition-all shadow-lg shadow-cyan-500/20">
            Create your studio →
          </a>
          <p className="text-gray-700 text-xs font-mono mt-4">Free to start · No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-8 py-6 flex items-center justify-between">
        <span className="text-xl font-black italic tracking-tighter uppercase text-gray-700">Casi</span>
        <div className="flex items-center gap-6">
          <a href="/search" className="text-[10px] font-mono text-gray-700 hover:text-gray-500 uppercase tracking-widest transition-colors">Find streams</a>
          <a href="/signup" className="text-[10px] font-mono text-gray-700 hover:text-gray-500 uppercase tracking-widest transition-colors">Sign up</a>
          <a href="/login" className="text-[10px] font-mono text-gray-700 hover:text-gray-500 uppercase tracking-widest transition-colors">Sign in</a>
        </div>
      </footer>

    </div>
  );
}
