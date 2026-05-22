'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SettingsSection from './SettingsSection';
import GhostButton from './GhostButton';

type AdminProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  suspended_at: string | null;
  created_at: string;
};

type RowState = 'idle' | 'saving';

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={32}
        height={32}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--ink-14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '13px',
        fontWeight: 700,
        color: 'var(--ink)',
        flexShrink: 0,
      }}
    >
      {(name[0] ?? '?').toUpperCase()}
    </div>
  );
}

function UserRow({
  profile,
  myId,
  onSuspend,
  onGrantAdmin,
}: {
  profile: AdminProfile;
  myId: string;
  onSuspend: (id: string, suspend: boolean) => Promise<void>;
  onGrantAdmin: (id: string, grant: boolean) => Promise<void>;
}) {
  const [state, setState] = useState<RowState>('idle');
  const isSelf = profile.id === myId;
  const isSuspended = !!profile.suspended_at;

  const handle = async (fn: () => Promise<void>) => {
    setState('saving');
    try { await fn(); } finally { setState('idle'); }
  };

  const label = profile.display_name || profile.username || 'Unnamed';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 0',
        borderBottom: '1px solid var(--line, var(--casi-border))',
        opacity: isSuspended ? 0.55 : 1,
      }}
    >
      <Avatar url={profile.avatar_url} name={label} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
          {profile.username ? (
            <span style={{ fontSize: '12px', color: 'var(--text-3)', fontFamily: 'var(--M, monospace)' }}>
              @{profile.username}
            </span>
          ) : null}
          {profile.is_admin ? (
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--M, monospace)',
              letterSpacing: '0.1em',
              color: 'var(--ink)',
              background: 'var(--ink-08)',
              border: '1px solid var(--ink-22)',
              borderRadius: '4px',
              padding: '2px 6px',
            }}>
              ADMIN
            </span>
          ) : null}
          {isSuspended ? (
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--M, monospace)',
              letterSpacing: '0.1em',
              color: '#f87171',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '4px',
              padding: '2px 6px',
            }}>
              SUSPENDED
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '2px' }}>
          Joined {new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {!isSelf && (
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <GhostButton
            variant={isSuspended ? 'default' : 'danger'}
            disabled={state === 'saving'}
            onClick={() => handle(() => onSuspend(profile.id, !isSuspended))}
          >
            {isSuspended ? 'Unban' : 'Ban'}
          </GhostButton>
          <GhostButton
            disabled={state === 'saving'}
            onClick={() => handle(() => onGrantAdmin(profile.id, !profile.is_admin))}
          >
            {profile.is_admin ? 'Revoke admin' : 'Make admin'}
          </GhostButton>
        </div>
      )}
    </div>
  );
}

type Props = {
  supabase: SupabaseClient;
  myId: string;
};

export default function AdminSection({ supabase, myId }: Props) {
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_admin, suspended_at, created_at')
      .order('created_at', { ascending: true });
    if (err) { setError(err.message); setLoading(false); return; }
    setProfiles((data ?? []) as AdminProfile[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const callRoute = async (path: string, body: object) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    await load();
  };

  const onSuspend = (id: string, suspend: boolean) =>
    callRoute('/api/admin/suspend', { target_id: id, suspend });

  const onGrantAdmin = (id: string, grant: boolean) =>
    callRoute('/api/admin/grant-admin', { target_id: id, grant });

  return (
    <SettingsSection
      id="admin"
      title="Admin"
      desc={`${profiles.length} account${profiles.length === 1 ? '' : 's'} registered.`}
    >
      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Loading…</p>
      ) : error ? (
        <p style={{ fontSize: '13px', color: '#f87171' }}>{error}</p>
      ) : (
        <div>
          {profiles.map(p => (
            <UserRow
              key={p.id}
              profile={p}
              myId={myId}
              onSuspend={onSuspend}
              onGrantAdmin={onGrantAdmin}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
