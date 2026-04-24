'use client';

import SettingsLayout, { type RailGroup } from './_components/SettingsLayout';
import ProfileSection from './_components/ProfileSection';
import PayoutsSection from './_components/PayoutsSection';
import SlotDefaultsSection from './_components/SlotDefaultsSection';
import ObsSourcesSection from './_components/ObsSourcesSection';
import SessionKeySection from './_components/SessionKeySection';
import NotificationsSection from './_components/NotificationsSection';
import ModerationSection from './_components/ModerationSection';
import DangerZoneSection from './_components/DangerZoneSection';

const RAIL: RailGroup[] = [
  {
    title: 'You',
    items: [
      { id: 'profile', label: 'Profile', icon: '◉' },
      { id: 'payouts', label: 'Payouts', icon: '€' },
      // Account rail item scrolls to danger-zone — no dedicated Account section in v3 handoff yet.
      { id: 'danger-zone', label: 'Account', icon: '☉' },
    ],
  },
  {
    title: 'Stream',
    items: [
      { id: 'slot-defaults', label: 'Slot defaults', icon: '▣' },
      { id: 'obs-sources', label: 'OBS sources', icon: '▹' },
      { id: 'session-key', label: 'Session key', icon: '⚿' },
    ],
  },
  {
    title: 'Alerts',
    items: [
      { id: 'notifications', label: 'Notifications', icon: '◇' },
    ],
  },
  {
    title: 'Safety',
    items: [
      { id: 'moderation', label: 'Moderation', icon: '✘' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--casi-bg)', color: 'var(--casi-text)' }}>
      <div
        className="mx-auto flex flex-wrap items-end justify-between gap-4"
        style={{ maxWidth: '1200px', padding: '28px 32px 0' }}
      >
        <div>
          <h1
            className="font-extrabold"
            style={{ fontSize: '30px', letterSpacing: '-1.2px', color: 'var(--casi-text)' }}
          >
            Settings
          </h1>
          <p className="mt-1" style={{ color: 'var(--casi-text-dim)', fontSize: '14px' }}>
            Everything about your account, stream, payouts, and rules — in one place.
          </p>
        </div>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'var(--casi-accent2)',
            padding: '6px 12px',
            border: '1px solid rgba(var(--casi-accent2-rgb), 0.3)',
            borderRadius: '999px',
            background: 'rgba(var(--casi-accent2-rgb), 0.08)',
          }}
        >
          ✓ Saved just now
        </span>
      </div>

      <SettingsLayout rail={RAIL}>
        <ProfileSection />
        <PayoutsSection />
        <SlotDefaultsSection />
        <ObsSourcesSection />
        <SessionKeySection />
        <NotificationsSection />
        <ModerationSection />
        <DangerZoneSection />
      </SettingsLayout>
    </main>
  );
}
