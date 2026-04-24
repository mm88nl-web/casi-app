'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicKey } from '@solana/web3.js';
import DelegateKeyCard from './DelegateKeyCard';

const THEME_PRESETS = [
  { name: 'Casi Orange',   color: '#F58220' },
  { name: 'Twitch Purple', color: '#9146FF' },
  { name: 'Cyber Cyan',    color: '#06b6d4' },
  { name: 'YouTube Red',   color: '#FF0000' },
  { name: 'Matrix Green',  color: '#4ade80' },
  { name: 'Kick Green',    color: '#53FC18' },
  { name: 'Rose Pink',     color: '#f472b6' },
  { name: 'Gold',          color: '#facc15' },
  { name: 'Pure White',    color: '#e8e8e8' },
];

type ProfileLite = {
  id: string;
  username: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  solana_wallet?: string | null;
};

type Props = {
  profile: ProfileLite;

  // Edit form state
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  bio: string;
  onBioChange: (v: string) => void;
  avatar: string;
  avatarValid: boolean;
  onAvatarChange: (v: string) => void;
  onAvatarValidChange: (v: boolean) => void;
  themeColor: string;
  onThemeColorChange: (v: string) => void;
  customColor: string;
  onCustomColorChange: (v: string) => void;
  allowFreeFlashes: boolean;
  onAllowFreeFlashesChange: (v: boolean) => void;
  saving: boolean;
  saved: boolean;

  onCancel: () => void;
  onSave: () => void | Promise<void>;

  // Preview-background upload
  previewBgUrl: string | null;
  uploadingPreviewBg: boolean;
  onPreviewBgUpload: (file: File) => void | Promise<void>;

  // Payment rails
  stripeConnected: boolean;
  stripeLoading: boolean;
  onStripeConnect: () => void;

  solanaWallet: string | null;
  walletConnected: boolean;
  walletConnecting: boolean;
  publicKey: PublicKey | null;
  savingWallet: boolean;
  walletSaved: boolean;
  onSaveWallet: () => void;
  onOpenWalletModal: () => void;

  // Session-key delegate
  delegateSupabase: SupabaseClient;
  delegateWalletReady: boolean;
  onInstallDelegate: (sessionPubkey: string, expiresAt: number) => Promise<{ solscanUrl: string }>;
};

export default function ProfileEditCard({
  profile,
  open, onOpenChange,
  name, onNameChange,
  bio, onBioChange,
  avatar, avatarValid, onAvatarChange, onAvatarValidChange,
  themeColor, onThemeColorChange, customColor, onCustomColorChange,
  allowFreeFlashes, onAllowFreeFlashesChange,
  saving, saved,
  onCancel, onSave,
  previewBgUrl, uploadingPreviewBg, onPreviewBgUpload,
  stripeConnected, stripeLoading, onStripeConnect,
  solanaWallet, walletConnected, walletConnecting, publicKey, savingWallet, walletSaved,
  onSaveWallet, onOpenWalletModal,
  delegateSupabase, delegateWalletReady, onInstallDelegate,
}: Props) {
  const headerName = open ? (name || profile.username) : (profile.display_name || profile.username);
  const headerAvatar = (avatarValid && avatar) || profile.avatar_url;

  return (
    <div className="set-card">
      {/* ── Profile summary row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid rgba(var(--casi-accent-rgb),0.25)', overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          {headerAvatar
            ? <img src={avatarValid && avatar ? avatar : profile.avatar_url!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            : '👤'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--casi-text)' }}>
            {headerName}
          </div>
          <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>@{profile.username}</div>
          {!open && profile.bio && <div style={{ fontSize: 12, color: 'var(--casi-text-muted)', marginTop: 4 }}>{profile.bio}</div>}
        </div>
        <button
          onClick={() => onOpenChange(!open)}
          style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 11, color: 'var(--casi-accent)', background: open ? 'rgba(var(--casi-accent-rgb),0.08)' : 'none', border: open ? '1px solid rgba(var(--casi-accent-rgb),0.2)' : '1px solid transparent', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0, transition: 'all .15s' }}
        >
          {open ? '✕ Close' : 'Edit ↓'}
        </button>
      </div>

      {/* ── Inline edit form ── */}
      {open && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--casi-border)', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Display name */}
          <div>
            <label className="pe-lbl">Display name</label>
            <input type="text" value={name} maxLength={32} className="pe-inp"
              placeholder={profile.username}
              onChange={(e) => onNameChange(e.target.value)} />
          </div>

          {/* Bio */}
          <div>
            <label className="pe-lbl">Bio</label>
            <textarea value={bio} maxLength={160} rows={3} className="pe-inp"
              style={{ resize: 'none', lineHeight: 1.5 }}
              placeholder="What do you stream?"
              onChange={(e) => onBioChange(e.target.value)} />
            <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, color: 'var(--casi-text-muted)', textAlign: 'right', marginTop: 2 }}>{bio.length}/160</div>
          </div>

          {/* Avatar */}
          <div>
            <label className="pe-lbl">Avatar URL</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                {avatarValid && avatar ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '👤'}
              </div>
              <input type="text" value={avatar} className="pe-inp" style={{ flex: 1 }}
                placeholder="https://your-image.png"
                onChange={(e) => { onAvatarChange(e.target.value); onAvatarValidChange(false); }} />
              {avatar && <img src={avatar} style={{ display: 'none' }} alt=""
                onLoad={() => onAvatarValidChange(true)} onError={() => onAvatarValidChange(false)} />}
            </div>
            {avatar && (
              <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, marginTop: 4, color: avatarValid ? '#4ade80' : '#f87171' }}>
                {avatarValid ? '✓ Image loaded' : 'Image not loading — check URL'}
              </div>
            )}
          </div>

          {/* Silhouette preview background */}
          <div>
            <label className="pe-lbl">
              Preview background
              <span style={{ fontFamily: 'inherit', letterSpacing: 0, textTransform: 'none', color: 'var(--casi-text-muted)', opacity: 0.6 }}> — OBS screenshot shown to viewers</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '10px 14px', cursor: uploadingPreviewBg ? 'wait' : 'pointer' }}>
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPreviewBgUpload(f); }} />
              {previewBgUrl
                ? <img src={previewBgUrl} style={{ width: 48, height: 27, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--casi-border)', flexShrink: 0 }} alt="" />
                : <div style={{ width: 48, height: 27, borderRadius: 4, border: '1px dashed var(--casi-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🖥</div>
              }
              <div>
                <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 700, fontSize: 12, color: previewBgUrl ? '#4ade80' : 'var(--casi-text)', marginBottom: 2 }}>
                  {uploadingPreviewBg ? 'Uploading…' : previewBgUrl ? '✓ Preview set' : 'Upload screenshot'}
                </div>
                <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: 'var(--casi-text-muted)' }}>
                  {previewBgUrl ? 'Click to replace' : 'jpg · png · max 5 MB'}
                </div>
              </div>
            </label>
          </div>

          {/* Accent color */}
          <div>
            <label className="pe-lbl">Accent color <span style={{ fontFamily: 'inherit', letterSpacing: 0, textTransform: 'none', color: 'var(--casi-text-muted)', opacity: 0.6 }}>— overlays skin accent</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
              {THEME_PRESETS.map(p => (
                <button key={p.color} type="button" title={p.name}
                  className={`pe-swatch${themeColor === p.color ? ' active' : ''}`}
                  style={{ background: p.color }}
                  onClick={() => { onThemeColorChange(p.color); onCustomColorChange(''); }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: themeColor, border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, boxShadow: `0 0 10px ${themeColor}50` }} />
              <input type="text" value={customColor || themeColor} placeholder="#F58220" maxLength={7}
                className="pe-inp" style={{ flex: 1, fontFamily: "var(--font-casi-mono),monospace", fontSize: 12 }}
                onChange={(e) => {
                  const v = e.target.value;
                  onCustomColorChange(v);
                  if (/^#[0-9A-Fa-f]{6}$/.test(v)) onThemeColorChange(v);
                }} />
            </div>
            <div style={{ height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${themeColor}, ${themeColor}40)`, marginTop: 10 }} />
          </div>

          {/* Stripe */}
          <div>
            <label className="pe-lbl">Payments — Stripe</label>
            <div style={{ background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: stripeConnected ? '#4ade80' : 'var(--casi-text)', marginBottom: 2 }}>
                  {stripeConnected ? '✓ Connected to Stripe' : 'Connect Stripe to get paid'}
                </div>
                <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>
                  {stripeConnected ? 'Viewers can pay for beam slots' : 'Required to accept card payments'}
                </div>
              </div>
              <button type="button" onClick={onStripeConnect} disabled={stripeLoading}
                style={{ background: stripeConnected ? 'rgba(74,222,128,0.1)' : 'var(--casi-accent)', border: stripeConnected ? '1px solid rgba(74,222,128,0.25)' : 'none', borderRadius: 8, padding: '8px 14px', fontFamily: "var(--font-casi-sans),sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', color: stripeConnected ? '#4ade80' : 'var(--casi-bg)', cursor: stripeLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {stripeLoading ? 'Redirecting…' : stripeConnected ? '↗ Manage' : 'Connect →'}
              </button>
            </div>
            <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, color: 'var(--casi-text-muted)', marginTop: 5 }}>100% of every tip lands in your Stripe account — no platform fee. Payouts go directly to your bank.</div>
          </div>

          {/* Solana wallet */}
          <div>
            <label className="pe-lbl">Solana wallet <span style={{ letterSpacing: 0, textTransform: 'none', opacity: 0.6 }}>— USDC streaming payments</span></label>
            <div style={{ background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: solanaWallet ? '#9945FF' : 'var(--casi-text)', marginBottom: 2 }}>
                  {solanaWallet ? `◎ ${solanaWallet.slice(0,6)}…${solanaWallet.slice(-4)}` : 'No wallet linked'}
                </div>
                <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>
                  {solanaWallet ? 'Viewers can pay with USDC on-chain' : 'Optional — Stripe works without this'}
                </div>
              </div>
              {walletConnected && publicKey ? (
                <button type="button" onClick={onSaveWallet} disabled={savingWallet}
                  style={{ background: walletSaved ? 'rgba(74,222,128,0.1)' : 'rgba(153,69,255,0.15)', border: walletSaved ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(153,69,255,0.35)', borderRadius: 8, padding: '8px 14px', fontFamily: "var(--font-casi-sans),sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', color: walletSaved ? '#4ade80' : '#9945FF', cursor: savingWallet ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {savingWallet ? 'Saving…' : walletSaved ? '✓ Saved!' : `Save ${publicKey.toBase58().slice(0,4)}…${publicKey.toBase58().slice(-4)}`}
                </button>
              ) : (
                <button type="button" onClick={onOpenWalletModal} disabled={walletConnecting}
                  style={{ background: 'rgba(153,69,255,0.1)', border: '1px solid rgba(153,69,255,0.3)', borderRadius: 8, padding: '8px 14px', fontFamily: "var(--font-casi-sans),sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', color: '#9945FF', cursor: walletConnecting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: walletConnecting ? 0.6 : 1 }}>
                  {walletConnecting ? 'Connecting…' : 'Connect Wallet'}
                </button>
              )}
            </div>
            <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 9, color: 'var(--casi-text-muted)', marginTop: 5 }}>Connect your wallet then click Save to link it to your profile.</div>
          </div>

          {/* Session key delegate */}
          <DelegateKeyCard
            supabase={delegateSupabase}
            walletReady={delegateWalletReady}
            onInstalled={onInstallDelegate}
          />

          {/* Free Flashes toggle */}
          <div>
            <label className="pe-lbl">Free tier <span style={{ letterSpacing: 0, textTransform: 'none', opacity: 0.6 }}>— let viewers send Flashes without paying</span></label>
            <div style={{ background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--casi-text)', marginBottom: 2 }}>Allow free Flashes</div>
                <div style={{ fontFamily: "var(--font-casi-mono),monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>Chat messages without payment · 1 per minute per viewer</div>
              </div>
              <button type="button" role="switch" aria-checked={allowFreeFlashes}
                onClick={() => onAllowFreeFlashesChange(!allowFreeFlashes)}
                style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, background: allowFreeFlashes ? 'var(--casi-accent)' : 'rgba(255,255,255,0.12)', transition: 'background .15s' }}>
                <span style={{ position: 'absolute', top: 2, left: allowFreeFlashes ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
            <button type="button" onClick={onCancel}
              style={{ flex: 1, padding: '10px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--casi-border)', borderRadius: 10, fontFamily: "var(--font-casi-sans),sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--casi-text-muted)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={onSave}
              style={{ flex: 2, padding: '10px 0', background: saved ? '#4ade80' : 'var(--casi-accent)', border: 'none', borderRadius: 10, fontFamily: "var(--font-casi-sans),sans-serif", fontWeight: 800, fontSize: 12, color: 'var(--casi-bg)', cursor: saving ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: 0.5, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
