'use client';

import { useState } from 'react';
import SettingsSection from './SettingsSection';
import FieldRow, { settingsInputStyle } from './FieldRow';
import ToggleRow from './ToggleRow';

export default function SlotDefaultsSection() {
  const [flashPrice, setFlashPrice] = useState('€1');
  const [beamRange, setBeamRange] = useState('€5 – €50');
  const [backdropRange, setBackdropRange] = useState('€12 – €80');
  const [manualApproval, setManualApproval] = useState(true);
  const [clickThrough, setClickThrough] = useState(true);
  const [allowUsdc, setAllowUsdc] = useState(true);
  const [freeTier, setFreeTier] = useState(false);

  return (
    <SettingsSection
      id="slot-defaults"
      title="Slot defaults"
      desc="Apply to new streams. Per-stream overrides still live on the dashboard."
    >
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
      >
        <FieldRow label="Flash · price" hint="15s text or image">
          <input
            value={flashPrice}
            onChange={(e) => setFlashPrice(e.target.value)}
            style={settingsInputStyle}
          />
        </FieldRow>
        <FieldRow label="Beam · range" hint="per 3 min · any shape">
          <input
            value={beamRange}
            onChange={(e) => setBeamRange(e.target.value)}
            style={settingsInputStyle}
          />
        </FieldRow>
        <FieldRow label="Backdrop beam · range" hint="per 5 min · full screen">
          <input
            value={backdropRange}
            onChange={(e) => setBackdropRange(e.target.value)}
            style={settingsInputStyle}
          />
        </FieldRow>
      </div>

      <div
        className="mt-2.5 font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.1em',
          color: 'var(--casi-text-faint)',
        }}
      >
        Backdrop is a beam with shape=backdrop · priced separately because it takes the whole scene.
      </div>

      <div style={{ marginTop: '20px' }}>
        <ToggleRow
          first
          title="Manual approval required"
          description="You approve every creative before it airs. Refunds issued on reject."
          on={manualApproval}
          onChange={setManualApproval}
        />
        <ToggleRow
          title="Allow click-through links on uploads"
          description="Viewers can attach a destination URL to an image or video."
          on={clickThrough}
          onChange={setClickThrough}
        />
        <ToggleRow
          title="Allow USDC"
          description="Accept on-chain payments alongside Stripe."
          on={allowUsdc}
          onChange={setAllowUsdc}
        />
        <ToggleRow
          title="Free tier — viewers can request slots at €0"
          description="Useful when building an audience. Off by default."
          on={freeTier}
          onChange={setFreeTier}
        />
      </div>
    </SettingsSection>
  );
}
