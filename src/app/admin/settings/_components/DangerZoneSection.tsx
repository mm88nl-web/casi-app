'use client';

import SettingsSection from './SettingsSection';
import GhostButton from './GhostButton';

export default function DangerZoneSection() {
  return (
    <SettingsSection
      id="danger-zone"
      title="Danger zone"
      desc="Pause bookings if you're on break. Delete removes everything — unpaid balances pay out first."
      danger
    >
      <div className="flex flex-wrap gap-2.5">
        <GhostButton type="button">Pause all bookings</GhostButton>
        <GhostButton type="button">Export my data</GhostButton>
        <GhostButton type="button" variant="danger">Delete account</GhostButton>
      </div>
    </SettingsSection>
  );
}
