'use client';

import { useState } from 'react';
import Logo from './Logo';
import { generateRandomName } from './viewerStorage';

type Props = {
  onConfirm: (name: string) => void;
  tc: string;
};

export default function NameEntryScreen({ onConfirm, tc }: Props) {
  const [name, setName] = useState(generateRandomName());
  const [showNote, setShowNote] = useState(false);

  return (
    <>
      <div style={{ minHeight:'100vh', background:'var(--casi-bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:"var(--font-casi-sans),sans-serif" }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:40 }}>
            <Logo scale={0.5} color={tc} />
            <div style={{ fontSize:28, fontWeight:800, color:tc, letterSpacing:-1, marginTop:8 }}>casi</div>
            <div style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, letterSpacing:3, textTransform:'uppercase', color:'#444', marginTop:4 }}>Viewer</div>
          </div>
          <div style={{ background:'var(--casi-surface)', border:'1px solid var(--casi-border)', borderRadius:16, padding:28, marginBottom:12 }}>
            <div style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'var(--casi-text-muted)', marginBottom:16 }}>Pick a name for this stream</div>
            <div style={{ position:'relative', marginBottom:8 }}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && onConfirm(name.trim())}
                maxLength={24}
                autoFocus
                style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid var(--casi-border)', borderRadius:10, padding:'13px 16px', paddingRight:90, fontSize:15, fontWeight:700, color:'var(--casi-text)', outline:'none', fontFamily:"var(--font-casi-sans),sans-serif" }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(var(--casi-accent-rgb),0.38)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--casi-border)'}
              />
              <button
                onClick={() => setName(generateRandomName())}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontFamily:"var(--font-casi-mono),monospace", fontSize:10, color:'#555', cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}
              >
                ↺ random
              </button>
            </div>
            <div style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, color:'#333', marginBottom:20 }}>A random name was generated — change it or keep it.</div>
            <button
              onClick={() => name.trim() && onConfirm(name.trim())}
              disabled={!name.trim()}
              style={{ width:'100%', background: name.trim() ? tc : 'var(--casi-border)', border:'none', borderRadius:10, padding:14, fontFamily:"var(--font-casi-sans),sans-serif", fontWeight:800, fontSize:14, textTransform:'uppercase', letterSpacing:0.5, color:'var(--casi-bg)', cursor: name.trim() ? 'pointer' : 'not-allowed', transition:'all .2s' }}
            >
              Enter stream →
            </button>
          </div>
          <button
            onClick={() => setShowNote(!showNote)}
            style={{ width:'100%', background:'none', border:'none', fontFamily:"var(--font-casi-mono),monospace", fontSize:10, color:'#333', cursor:'pointer', textTransform:'uppercase', letterSpacing:1.5, padding:'10px 0' }}
          >
            Have an account? Sign in
          </button>
          {showNote && (
            <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid #111', borderRadius:10, padding:16, textAlign:'center', marginTop:8 }}>
              <div style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:11, color:'#444', lineHeight:1.7 }}>Account sign-in coming soon.<br />Your name is saved on this device for now.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
