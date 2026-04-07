"use client";
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function JoinPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // 1. Create the user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert('Check your email for a confirmation link!');
      // 2. Create the blank profile for the streamer
      if (data.user) {
        await supabase.from('profiles').insert({ id: data.user.id });
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white text-black font-sans px-4">
      <h1 className="text-4xl font-black tracking-tighter mb-8">CASI.</h1>
      <form onSubmit={handleSignUp} className="border border-black p-10 shadow-2xl w-full max-w-md space-y-6">
        <h2 className="text-xl font-bold uppercase tracking-widest text-center">Streamer Registration</h2>
        <input 
          type="email" 
          placeholder="Email" 
          className="w-full border-b border-black py-2 focus:outline-none" 
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input 
          type="password" 
          placeholder="Password" 
          className="w-full border-b border-black py-2 focus:outline-none" 
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-black text-white py-4 font-bold hover:bg-gray-800 transition uppercase tracking-tighter"
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}
