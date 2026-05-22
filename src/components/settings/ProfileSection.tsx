'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SettingsSection from './SettingsSection';
import FieldRow, { settingsInputStyle, settingsTextareaStyle } from './FieldRow';
import GhostButton from './GhostButton';

export type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  skin: string | null;
  solana_wallet: string | null;
  stripe_account_id: string | null;
  theme_color: string | null;
  ink_color: string | null;
  paper_color: string | null;
  accent2_color: string | null;
  is_admin: boolean;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  supabase: SupabaseClient;
  profile: ProfileRow;
};

export default function ProfileSection({ supabase, profile }: Props) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [slug, setSlug] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url ?? null);
  const [avatarBusy, setAvatarBusy] = useState<'upload' | 'remove' | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Track committed values so we can detect field-level changes on blur without firing on every keystroke.
  const committedRef = useRef({
    displayName: profile.display_name ?? '',
    slug: profile.username ?? '',
    bio: profile.bio ?? '',
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const persist = async (patch: Partial<{ display_name: string; username: string; bio: string; avatar_url: string | null }>) => {
    setSaveState('saving');
    setErrorMsg(null);
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
    if (error) {
      setSaveState('error');
      setErrorMsg(error.message);
      return;
    }
    setSaveState('saved');
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
  };

  const onBlurName = () => {
    const trimmed = displayName.trim();
    if (trimmed === committedRef.current.displayName) return;
    committedRef.current.displayName = trimmed;
    persist({ display_name: trimmed });
  };

  const onBlurSlug = () => {
    // Slugs are lowercased and stripped of spaces as a cheap client-side guard;
    // the server still enforces uniqueness + the full allowlist.
    const trimmed = slug.trim().toLowerCase().replace(/\s+/g, '');
    if (trimmed !== slug) setSlug(trimmed);
    if (trimmed === committedRef.current.slug) return;
    committedRef.current.slug = trimmed;
    persist({ username: trimmed });
  };

  const onBlurBio = () => {
    const trimmed = bio.trimEnd();
    if (trimmed !== bio) setBio(trimmed);
    if (trimmed === committedRef.current.bio) return;
    committedRef.current.bio = trimmed;
    persist({ bio: trimmed });
  };

  // Avatar upload — uses the same `casi-media` bucket as preview-bg uploads.
  // Path is keyed by profile.id + ext so re-uploading replaces in place via
  // upsert; we don't manage versioning since the public URL doesn't cache
  // bust on its own. (If that ever bites, append a `?v=${Date.now()}` to the
  // saved URL.)
  const onAvatarFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-pick of the same filename
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setSaveState('error');
      setErrorMsg('Avatar too large — keep it under 2 MB.');
      return;
    }
    if (!/^image\//.test(file.type)) {
      setSaveState('error');
      setErrorMsg('Pick an image file.');
      return;
    }
    setAvatarBusy('upload');
    setErrorMsg(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `${profile.id}-avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('casi-media')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('casi-media').getPublicUrl(path);
      // Cache-bust so the new image shows immediately (Supabase Storage CDN
      // can serve the old object for ~minutes after an upsert).
      const cacheBusted = `${publicUrl}?v=${Date.now()}`;
      setAvatarUrl(cacheBusted);
      await persist({ avatar_url: cacheBusted });
    } catch (err) {
      setSaveState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Avatar upload failed');
    } finally {
      setAvatarBusy(null);
    }
  };

  const onRemoveAvatar = async () => {
    if (!avatarUrl) return;
    setAvatarBusy('remove');
    setErrorMsg(null);
    try {
      setAvatarUrl(null);
      await persist({ avatar_url: null });
    } finally {
      setAvatarBusy(null);
    }
  };

  const initial = (displayName || slug || '?').slice(0, 1).toUpperCase();

  return (
    <SettingsSection
      id="profile"
      title="Profile & your link"
      desc={
        <>
          This is what viewers see. Your URL is{' '}
          <code style={{ color: 'var(--casi-accent)' }}>
            www.casi.gg/overlay?s={slug || '—'}
          </code>
          .
        </>
      }
      actions={<SaveIndicator state={saveState} error={errorMsg} />}
    >
      <div className="mb-5 flex items-center gap-4">
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden"
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '16px',
            background: avatarUrl
              ? '#000'
              : 'linear-gradient(135deg, rgba(var(--casi-accent-rgb), 0.5), rgba(var(--casi-accent2-rgb), 0.4))',
            fontFamily: 'var(--font-casi-sans)',
            fontSize: '28px',
            fontWeight: 800,
            color: '#0a0a0a',
          }}
          aria-hidden
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            initial
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png, image/jpeg, image/webp, image/gif"
          onChange={onAvatarFilePicked}
          style={{ display: 'none' }}
        />
        <div className="flex flex-col items-start gap-1.5">
          <GhostButton
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarBusy !== null}
          >
            {avatarBusy === 'upload' ? 'Uploading…' : avatarUrl ? 'Replace' : 'Upload avatar'}
          </GhostButton>
          <GhostButton
            type="button"
            variant="danger"
            onClick={onRemoveAvatar}
            disabled={!avatarUrl || avatarBusy !== null}
          >
            {avatarBusy === 'remove' ? 'Removing…' : 'Remove'}
          </GhostButton>
        </div>
      </div>

      <div className="casi-grid-2">
        <FieldRow label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={onBlurName}
            style={{
              ...settingsInputStyle,
              fontFamily: 'var(--font-casi-sans)',
              fontSize: '15px',
              fontWeight: 600,
            }}
          />
        </FieldRow>
        <FieldRow label="Your link · www.casi.gg/overlay?s=">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onBlur={onBlurSlug}
            style={settingsInputStyle}
          />
        </FieldRow>
      </div>

      <div style={{ marginTop: '16px' }}>
        <FieldRow label="Bio · shown on your viewer page">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            onBlur={onBlurBio}
            style={settingsTextareaStyle}
          />
        </FieldRow>
      </div>

    </SettingsSection>
  );
}

function SaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
  if (state === 'idle') return null;

  const kinds: Record<Exclude<SaveState, 'idle'>, { bg: string; fg: string; border: string; label: string }> = {
    saving: {
      bg: 'var(--casi-surface)',
      fg: 'var(--casi-text-dim)',
      border: 'var(--casi-border-2)',
      label: 'Saving…',
    },
    saved: {
      bg: 'rgba(var(--casi-accent2-rgb), 0.08)',
      fg: 'var(--casi-accent2)',
      border: 'rgba(var(--casi-accent2-rgb), 0.3)',
      label: '✓ Saved',
    },
    error: {
      bg: 'rgba(239, 68, 68, 0.08)',
      fg: '#f87171',
      border: 'rgba(239, 68, 68, 0.3)',
      label: '× Save failed',
    },
  };

  const style = kinds[state];
  return (
    <span
      className="font-mono uppercase"
      style={{
        padding: '5px 10px',
        borderRadius: '999px',
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.fg,
        fontSize: '10px',
        letterSpacing: '0.14em',
      }}
      title={state === 'error' && error ? error : undefined}
    >
      {style.label}
    </span>
  );
}
