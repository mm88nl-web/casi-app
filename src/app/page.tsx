"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const HEADLINE = "Monetize your stream";
const SUBHEADLINE = "Let viewers rent space on your live stream. They place their image, GIF, or brand on your screen — you get paid per minute.";
const STEPS = [
  { icon: "✦", title: "Create a slot", body: "Add beam slots or a full backdrop to your OBS overlay in seconds." },
  { icon: "$", title: "Set your price", body: "Charge per minute or per hour. You set the rate, viewers pay to be seen." },
  { icon: "●", title: "Go live", body: "Viewers request their image, you approve it, it appears on stream instantly." },
];

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

      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-white/5">
        <h1 className="text-xl sm:text-2xl font-black italic tracking-tighter uppercase">Casi</h1>
        <div className="flex items-center gap-3 sm:gap-6">
          {liveCount > 0 && (
            <a href="/search" className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-red-400 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />{liveCount} live now
            </a>
          )}
          <a href="/search" className="text-[10px] font-mono text-gray-500 hover:text-white uppercase tracking-widest transition-colors hidden sm:block">Browse</a>
          <a href="/login" className="text-[10px] font-mono text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Sign in</a>
          <a href="/signup" className="bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black text-[10px] font-black px-3 sm:px-4 py-2 rounded uppercase tracking-widest transition-all touch-manipulation">
            Start →
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-8 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
        {streamerCount > 0 && (
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6 sm:mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{streamerCount} streamer{streamerCount !== 1 ? 's' : ''} on Casi</span>
          </div>
        )}
        <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black italic uppercase tracking-tighter leading-none mb-4 sm:mb-6">
          {HEADLINE}
        </h2>
        <p className="text-gray-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed mb-8 sm:mb-10 px-2">
          {SUBHEADLINE}
        </p>
        <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap px-4">
          <a href="/signup" className="bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black font-black px-6 sm:px-8 py-3 sm:py-4 rounded-xl uppercase tracking-widest text-sm transition-all shadow-lg shadow-cyan-500/20 touch-manipulation">
            Start streaming →
          </a>
          <a href="/search" className="bg-white/5 hover:bg-white/10 active:bg-white/15 text-white font-black px-6 sm:px-8 py-3 sm:py-4 rounded-xl uppercase tracking-widest text-sm transition-all border border-white/10 touch-manipulation">
            Find a stream
          </a>
        </div>
      </section>

      {/* Stream mockup */}
      <section className="max-w-4xl mx-auto px-4 sm:px-8 pb-16 sm:pb-24">
        <div className="relative aspect-video rounded-xl sm:rounded-2xl border border-white/10 bg-black overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-3/4 bg-gradient-to-t from-gray-700/20 to-transparent rounded-t-full" />

          {/* Beam slot top left */}
          <div className="absolute top-3 sm:top-6 left-3 sm:left-6 w-20 sm:w-28 h-14 sm:h-20 rounded-lg sm:rounded-xl border-2 border-cyan-500/60 bg-cyan-500/10 flex flex-col items-center justify-center shadow-lg shadow-cyan-500/10">
            <span className="text-cyan-400 text-base sm:text-lg mb-0.5">✦</span>
            <span className="text-[7px] sm:text-[8px] font-mono text-cyan-400/70 uppercase tracking-widest">Beam slot</span>
            <span className="text-[7px] sm:text-[8px] font-black text-cyan-400">$5/min</span>
          </div>

          {/* Occupied beam top right */}
          <div className="absolute top-3 sm:top-6 right-3 sm:right-6 w-20 sm:w-28 h-14 sm:h-20 rounded-lg sm:rounded-xl border-2 border-white/20 overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-orange-500/40 to-red-500/20 flex items-center justify-center">
              <div className="text-center">
                <div className="w-7 sm:w-10 h-7 sm:h-10 rounded-lg bg-orange-500/30 border border-orange-500/40 mx-auto mb-0.5 sm:mb-1 flex items-center justify-center text-base sm:text-lg">🔥</div>
                <span className="text-[7px] sm:text-[8px] font-black text-orange-300">CoolTiger42</span>
              </div>
            </div>
          </div>

          {/* Live badge */}
          <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-[8px] sm:text-[9px] font-black px-2 sm:px-3 py-0.5 sm:py-1 rounded-full uppercase tracking-widest flex items-center gap-1 sm:gap-1.5">
            <span className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-white animate-pulse" />Live
          </div>

          {/* Backdrop label */}
          <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2">
            <div className="bg-black/80 backdrop-blur-sm border border-purple-500/40 rounded-full px-3 sm:px-4 py-1 sm:py-1.5 flex items-center gap-1.5 sm:gap-2">
              <span className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-purple-400" />
              <span className="text-[8px] sm:text-[9px] font-mono text-purple-400 uppercase tracking-widest whitespace-nowrap">Full Backdrop — $10/hr</span>
            </div>
          </div>

          {/* Earnings */}
          <div className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 bg-black/80 backdrop-blur-sm border border-green-500/30 rounded-xl px-2 sm:px-3 py-1.5 sm:py-2">
            <p className="text-[7px] sm:text-[8px] font-mono text-gray-500 uppercase tracking-widest">Earning</p>
            <p className="text-xs sm:text-sm font-black text-green-400">$4.80/min</p>
          </div>
        </div>
        <p className="text-center text-[10px] font-mono text-gray-600 mt-3 uppercase tracking-widest">Your stream, monetized in real time</p>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 sm:px-8 pb-16 sm:pb-24">
        <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest text-center mb-8 sm:mb-12">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {STEPS.map((step, i) => (
            <div key={i} className="bg-white/3 border border-white/8 rounded-2xl p-5 sm:p-6">
              <div className="w-9 sm:w-10 h-9 sm:h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-black text-base sm:text-lg mb-3 sm:mb-4">
                {step.icon}
              </div>
              <h3 className="font-black text-white text-base sm:text-lg mb-1 sm:mb-2">{step.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-2xl mx-auto px-4 sm:px-8 pb-16 sm:pb-24 text-center">
        <div className="bg-white/3 border border-white/8 rounded-2xl p-8 sm:p-10">
          <h3 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter mb-2 sm:mb-3">Ready to start?</h3>
          <p className="text-gray-500 text-sm mb-6 sm:mb-8">Set up your stream overlay in under 5 minutes.</p>
          <a href="/signup" className="inline-block bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black font-black px-8 sm:px-10 py-3 sm:py-4 rounded-xl uppercase tracking-widest text-sm transition-all shadow-lg shadow-cyan-500/20 touch-manipulation">
            Create your studio →
          </a>
          <p className="text-gray-700 text-xs font-mono mt-4">Free to start · No credit card required</p>
        </div>
      </section>

      <footer className="border-t border-white/5 px-4 sm:px-8 py-5 sm:py-6 flex flex-col sm:flex-row items-center gap-3 sm:gap-0 justify-between">
        <span className="text-lg sm:text-xl font-black italic tracking-tighter uppercase text-gray-700">Casi</span>
        <div className="flex items-center gap-4 sm:gap-6">
          <a href="/search" className="text-[10px] font-mono text-gray-700 hover:text-gray-500 uppercase tracking-widest transition-colors">Find streams</a>
          <a href="/signup" className="text-[10px] font-mono text-gray-700 hover:text-gray-500 uppercase tracking-widest transition-colors">Sign up</a>
          <a href="/login" className="text-[10px] font-mono text-gray-700 hover:text-gray-500 uppercase tracking-widest transition-colors">Sign in</a>
        </div>
      </footer>
    </div>
  );
}
