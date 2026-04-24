'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SettingsSection from './SettingsSection';
import FieldRow, { settingsInputStyle, settingsTextareaStyle } from './FieldRow';
import GhostButton from './GhostButton';
import SolanaLogo from '@/components/SolanaLogo';

export type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  skin: string | null;
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
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Track committed values so we can detect field-level changes on blur without firing on every keystroke.
  const committedRef = useRef({
    displayName: profile.display_name ?? '',
    slug: profile.username ?? '',
    bio: profile.bio ?? '',
  });

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const persist = async (patch: Partial<{ display_name: string; username: string; bio: string }>) => {
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
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={`${displayName || slug} avatar`}
            width={72}
            height={72}
            style={{ width: '72px', height: '72px', borderRadius: '16px', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          // Default avatar = Solana brandmark inside a dark tile. Signals the
          // streamer's crypto-rail identity until they upload something custom.
          // Falls back to the first initial if SolanaLogo is ever stripped
          // (older admin copy still uses initials).
          <div
            className="flex shrink-0 items-center justify-center relative"
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '16px',
              background: '#0a0a0a',
              border: '1px solid var(--casi-border)',
              overflow: 'hidden',
            }}
            aria-label={`${displayName || slug || 'streamer'} avatar placeholder`}
          >
            <SolanaLogo size={52} />
            <span
              aria-hidden
              style={{
                position: 'absolute',
                bottom: '6px',
                right: '8px',
                fontFamily: 'var(--font-casi-mono)',
                fontSize: '9px',
                letterSpacing: '0.14em',
                color: 'var(--casi-text-faint)',
                textTransform: 'uppercase',
              }}
            >
              {initial}
            </span>
          </div>
        )}
        <div className="flex flex-col items-start gap-1.5">
          <GhostButton type="button" disabled title="Avatar upload coming soon — using Solana default for now">
            Upload avatar
          </GhostButton>
          <GhostButton type="button" variant="danger" disabled>Remove</GhostButton>
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
