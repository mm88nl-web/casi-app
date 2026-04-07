"use client";
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

type Step = 'account' | 'username' | 'profile';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarValid, setAvatarValid] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const steps: Step[] = ['account', 'username', 'profile'];
  const stepIndex = steps.indexOf(step);

  const handleAccountStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setStep('username');
  };

  const checkUsername = async (val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    if (cleaned.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const { data } = await supabase.from('profiles').select('username').eq('username', cleaned).single();
    setUsernameStatus(data ? 'taken' : 'available');
  };

  const handleUsernameStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus !== 'available') return;
    setDisplayName(username); // pre-fill display name from username
    setStep('profile');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError || !authData.user) {
      setError(authError?.message || 'Signup failed');
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      username,
      display_name: displayName || username,
      bio: bio || null,
      avatar_url: avatarValid ? avatarUrl : null,
      is_live: false,
    });

    if (profileError) {
      setError('Could not create profile — ' + profileError.message);
      setLoading(false);
      return;
    }

    router.push('/admin');
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <h1 className="text-5xl font-black italic uppercase tracking-tighter">CASI</h1>
          <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-[0.2em] font-bold">Create your streamer studio</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${i < stepIndex ? 'text-green-400' : i === stepIndex ? 'text-cyan-400' : 'text-gray-600'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${i < stepIndex ? 'bg-green-500 text-black' : i === stepIndex ? 'bg-cyan-500 text-black' : 'bg-white/10 text-gray-500'}`}>
                  {i < stepIndex ? '✓' : i + 1}
                </span>
                {s}
              </div>
              {i < steps.length - 1 && <div className="w-8 h-px bg-white/10" />}
            </div>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 p-8 rounded-2xl">

          {/* Step 1 — Account */}
          {step === 'account' && (
            <form onSubmit={handleAccountStep} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1 block">Email</label>
                <input required type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="streamer@email.com" autoFocus
                  className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-cyan-500 transition-all" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1 block">Password</label>
                <input required type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-cyan-500 transition-all" />
              </div>
              {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
              <button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-black py-4 rounded-xl uppercase tracking-widest transition-all">
                Continue →
              </button>
            </form>
          )}

          {/* Step 2 — Username */}
          {step === 'username' && (
            <form onSubmit={handleUsernameStep} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1 block mb-1">Your streamer username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-mono">@</span>
                  <input type="text" value={username}
                    onChange={(e) => checkUsername(e.target.value)}
                    placeholder="yourname" autoFocus maxLength={24}
                    className="w-full bg-black border border-white/10 pl-9 pr-4 py-4 rounded-xl text-sm outline-none transition-all"
                    style={{ borderColor: usernameStatus === 'available' ? 'rgba(6,182,212,0.6)' : usernameStatus === 'taken' ? 'rgba(239,68,68,0.6)' : undefined }} />
                </div>
                <p className="text-[10px] font-mono mt-1.5 ml-1 h-4">
                  {usernameStatus === 'checking' && <span className="text-gray-500">Checking...</span>}
                  {usernameStatus === 'available' && <span className="text-cyan-400">✓ Available</span>}
                  {usernameStatus === 'taken' && <span className="text-red-400">✗ Already taken</span>}
                  {usernameStatus === 'idle' && username.length > 0 && username.length < 3 && <span className="text-gray-600">Min 3 characters</span>}
                  {usernameStatus === 'idle' && username.length === 0 && <span className="text-gray-600">Lowercase letters, numbers, underscores</span>}
                </p>
              </div>

              {usernameStatus === 'available' && (
                <div className="bg-white/3 border border-white/8 rounded-xl p-3 animate-in fade-in duration-200">
                  <p className="text-[9px] font-mono text-gray-500 mb-1">Your viewer overlay will be at:</p>
                  <p className="text-xs font-black text-cyan-400 font-mono truncate">{origin}/overlay?s={username}</p>
                  <p className="text-[9px] font-mono text-gray-500 mt-1.5">Your public profile:</p>
                  <p className="text-xs font-black text-purple-400 font-mono truncate">{origin}/s/{username}</p>
                </div>
              )}

              {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setStep('account'); setError(''); }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 font-black py-4 rounded-xl uppercase tracking-widest transition-all text-sm">
                  ← Back
                </button>
                <button type="submit" disabled={usernameStatus !== 'available'}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-800 disabled:text-gray-600 text-black font-black py-4 rounded-xl uppercase tracking-widest transition-all text-sm">
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* Step 3 — Profile */}
          {step === 'profile' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">Set up your public profile</p>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 overflow-hidden flex-shrink-0 flex items-center justify-center bg-white/5">
                  {avatarValid
                    ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
                    : <span className="text-2xl">👤</span>}
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase text-gray-400 ml-1 block mb-1">Avatar URL (optional)</label>
                  <input type="text" value={avatarUrl}
                    onChange={(e) => { setAvatarUrl(e.target.value); setAvatarValid(false); }}
                    placeholder="https://your-image.png"
                    className="w-full bg-black border border-white/10 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-cyan-500 transition-all" />
                  {avatarUrl && <img src={avatarUrl} className="hidden" alt="" onLoad={() => setAvatarValid(true)} onError={() => setAvatarValid(false)} />}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1 block">Display name</label>
                <input type="text" value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={username} maxLength={32}
                  className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-cyan-500 transition-all" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1 block">Bio <span className="text-gray-600 normal-case font-normal">— optional</span></label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)}
                  placeholder="What do you stream? Tell viewers about yourself..."
                  rows={3} maxLength={160}
                  className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-cyan-500 transition-all resize-none placeholder:text-gray-700" />
                <p className="text-[9px] font-mono text-gray-600 text-right">{bio.length}/160</p>
              </div>

              {error && <p className="text-red-400 text-xs font-mono">{error}</p>}

              <div className="flex gap-3">
                <button type="button" onClick={() => { setStep('username'); setError(''); }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 font-black py-4 rounded-xl uppercase tracking-widest transition-all text-sm">
                  ← Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-800 disabled:text-gray-600 text-black font-black py-4 rounded-xl uppercase tracking-widest transition-all text-sm">
                  {loading ? 'Launching...' : 'Launch Studio →'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Already have a studio?{' '}
          <a href="/login" className="text-white font-bold hover:text-cyan-400 transition-colors">Sign in</a>
        </p>
      </div>
    </div>
  );
}
