'use client';

import { useState } from 'react';
import SettingsSection from './SettingsSection';
import FieldRow, { settingsTextareaStyle } from './FieldRow';
import { BlockChip, AddChip } from './BlockChip';

export default function ModerationSection() {
  const [categories, setCategories] = useState<string[]>(['NSFW', 'Political', 'Gambling', 'Alcohol']);
  const [keywords, setKeywords] = useState('scam, pump, giveaway, free robux, nft drop');
  const [users, setUsers] = useState<string[]>(['@spam_guy_42', '@bot_farm_xx']);

  const removeCategory = (name: string) => setCategories((prev) => prev.filter((c) => c !== name));
  const removeUser = (name: string) => setUsers((prev) => prev.filter((u) => u !== name));

  const addCategory = () => {
    const next = window.prompt('Block category')?.trim();
    if (next && !categories.includes(next)) setCategories([...categories, next]);
  };

  const addUser = () => {
    const raw = window.prompt('Block user (e.g. @handle)')?.trim();
    if (!raw) return;
    const handle = raw.startsWith('@') ? raw : `@${raw}`;
    if (!users.includes(handle)) setUsers([...users, handle]);
  };

  return (
    <SettingsSection
      id="moderation"
      title="Moderation"
      desc="Auto-block categories and words. Bad actors get refunded without bothering you."
    >
      <div style={{ marginBottom: '16px' }}>
        <FieldRow label="Auto-block categories">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <BlockChip key={c} label={c} onRemove={() => removeCategory(c)} />
            ))}
            <AddChip onClick={addCategory}>+ add category</AddChip>
          </div>
        </FieldRow>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <FieldRow label="Blocked keywords · comma separated">
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            style={{
              ...settingsTextareaStyle,
              fontFamily: 'var(--font-casi-mono)',
              fontSize: '12px',
            }}
          />
        </FieldRow>
      </div>

      <FieldRow label="Blocked users">
        <div className="flex flex-wrap gap-1.5">
          {users.map((u) => (
            <BlockChip key={u} label={u} onRemove={() => removeUser(u)} />
          ))}
          <AddChip onClick={addUser}>+ block user</AddChip>
        </div>
      </FieldRow>
    </SettingsSection>
  );
}
