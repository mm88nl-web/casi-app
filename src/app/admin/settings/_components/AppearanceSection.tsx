'use client';

import SettingsSection from './SettingsSection';
import SkinPicker from '@/components/SkinPicker';

export default function AppearanceSection() {
  return (
    <SettingsSection
      id="appearance"
      title="Appearance"
      desc="Skin this device. Your choice is remembered locally — viewers on your stream still see whatever skin you picked for the overlay itself."
    >
      <SkinPicker />
    </SettingsSection>
  );
}
