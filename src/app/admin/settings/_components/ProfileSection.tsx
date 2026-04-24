'use client';

import { useState } from 'react';
import SettingsSection from './SettingsSection';
import FieldRow, { settingsInputStyle, settingsTextareaStyle } from './FieldRow';
import GhostButton from './GhostButton';

export default function ProfileSection() {
  const [displayName, setDisplayName] = useState('pixel_hana');
  const [slug, setSlug] = useState('pixel_hana');
  const [bio, setBio] = useState('variety streamer · berlin · cozy games & bad decisions. dm for collabs.');
  const [twitch, setTwitch] = useState('pixel_hana');
  const [twitter, setTwitter] = useState('@pixel_hana');

  const initial = displayName.slice(0, 1).toUpperCase() || 'P';

  return (
    <SettingsSection
      id="profile"
      title="Profile & your link"
      desc={
        <>
          This is what viewers see. Your URL is{' '}
          <code style={{ color: 'var(--casi-accent)' }}>
            www.casi.gg/overlay?s=<span>{slug}</span>
          </code>
          .
        </>
      }
    >
      <div className="mb-5 flex items-center gap-4">
        <div
          className="flex shrink-0 items-center justify-center"
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '16px',
            background:
              'linear-gradient(135deg, rgba(var(--casi-accent-rgb), 0.5), rgba(var(--casi-accent2-rgb), 0.4))',
            fontFamily: 'var(--font-casi-sans)',
            fontSize: '28px',
            fontWeight: 800,
            color: '#0a0a0a',
          }}
          aria-hidden
        >
          {initial}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <GhostButton type="button">Upload avatar</GhostButton>
          <GhostButton type="button" variant="danger">Remove</GhostButton>
        </div>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
      >
        <FieldRow label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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
            style={settingsInputStyle}
          />
        </FieldRow>
      </div>

      <div style={{ marginTop: '16px' }}>
        <FieldRow label="Bio · shown on your viewer page">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            style={settingsTextareaStyle}
          />
        </FieldRow>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: '16px' }}
      >
        <FieldRow label="Twitch">
          <input
            value={twitch}
            onChange={(e) => setTwitch(e.target.value)}
            placeholder="username"
            style={settingsInputStyle}
          />
        </FieldRow>
        <FieldRow label="Twitter / X">
          <input
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
            placeholder="@handle"
            style={settingsInputStyle}
          />
        </FieldRow>
      </div>
    </SettingsSection>
  );
}
