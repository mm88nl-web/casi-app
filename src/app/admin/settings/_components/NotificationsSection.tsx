'use client';

import { useState } from 'react';
import SettingsSection from './SettingsSection';
import ToggleRow from './ToggleRow';

export default function NotificationsSection() {
  const [approvals, setApprovals] = useState(true);
  const [payouts, setPayouts] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [product, setProduct] = useState(false);

  return (
    <SettingsSection
      id="notifications"
      title="Notifications"
      desc="Only when something actually needs you."
    >
      <ToggleRow
        first
        title="New booking needs approval"
        description="Push to phone and in-dashboard toast."
        on={approvals}
        onChange={setApprovals}
      />
      <ToggleRow
        title="Payout sent"
        description="Email only."
        on={payouts}
        onChange={setPayouts}
      />
      <ToggleRow
        title="Weekly summary"
        description="Monday morning earnings recap."
        on={weekly}
        onChange={setWeekly}
      />
      <ToggleRow
        title="Product updates from casi"
        description="New features. Rare."
        on={product}
        onChange={setProduct}
      />
    </SettingsSection>
  );
}
