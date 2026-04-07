"use client";
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
    } else {
      router.push('/admin'); // Redirect to their personal Studio/Settings
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black italic uppercase tracking-tighter italic">CASI</h1>
          <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-[0.2em] font-bold">Streamer Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Email</label>
            <input 
              required
              type="email" 
              placeholder="streamer@email.com"
              className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-cyan-500 transition-all"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Password</label>
            <input 
              required
              type="password" 
              placeholder="••••••••"
              className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-cyan-500 transition-all"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button 
            disabled={loading}
            className="w-full bg-white text-black font-black py-4 rounded-xl uppercase tracking-widest hover:bg-cyan-400 transition-all disabled:opacity-50 mt-4"
          >
            {loading ? "Authenticating..." : "Enter Studio"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Don't have a studio? <a href="/signup" className="text-white font-bold hover:text-cyan-400 underline decoration-cyan-500/30">Sign up here</a>
          </p>
        </div>
      </div>
    </div>
  );
}
