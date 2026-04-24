'use client';

import SettingsSection from './SettingsSection';
import GhostButton from './GhostButton';

export default function SessionKeySection() {
  return (
    <SettingsSection
      id="session-key"
      title="Session key"
      desc="Lets the server approve pending beams on your behalf — so viewers don't see a wallet pop-up every time you confirm one. Scoped to approvals only; can't move funds or settle escrows."
    >
      <div
        className="flex items-center justify-between gap-4"
        style={{
          padding: '16px 18px',
          border: '1px solid var(--casi-border)',
          borderRadius: '12px',
          background: 'var(--casi-bg)',
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{ fontSize: '14px', color: 'var(--casi-accent)', letterSpacing: '0.02em' }}
          >
            ◉ CmmS…Xycs
          </div>
          <div className="mt-1" style={{ fontSize: '12px', color: 'var(--casi-text-dim)' }}>
            Active · expires in 7d
          </div>
        </div>
        <div className="flex gap-2">
          <GhostButton type="button">Rotate</GhostButton>
          <GhostButton type="button" variant="danger">Revoke</GhostButton>
        </div>
      </div>
    </SettingsSection>
  );
}
