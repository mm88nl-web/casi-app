'use client';

import { useState } from 'react';
import SettingsSection from './SettingsSection';
import FieldRow, { settingsTextareaStyle } from './FieldRow';
import { BlockChip, AddChip } from './BlockChip';

type InlineAddProps = {
  placeholder: string;
  prompt: string;
  onAdd: (value: string) => void;
  /** Optional normalizer — e.g. to prefix a handle with "@". */
  normalize?: (raw: string) => string;
};

function InlineAdd({ placeholder, prompt, onAdd, normalize }: InlineAddProps) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');

  if (!active) {
    return <AddChip onClick={() => setActive(true)}>{placeholder}</AddChip>;
  }

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onAdd(normalize ? normalize(trimmed) : trimmed);
    setValue('');
    setActive(false);
  };

  const cancel = () => {
    setValue('');
    setActive(false);
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      placeholder={prompt}
      className="font-mono"
      style={{
        padding: '6px 10px',
        borderRadius: '999px',
        background: 'var(--casi-bg)',
        border: '1px solid var(--casi-accent)',
        color: 'var(--casi-text)',
        fontSize: '11px',
        outline: 'none',
        minWidth: '140px',
      }}
    />
  );
}

export default function ModerationSection() {
  const [categories, setCategories] = useState<string[]>(['NSFW', 'Political', 'Gambling', 'Alcohol']);
  const [keywords, setKeywords] = useState('scam, pump, giveaway, free robux, nft drop');
  const [users, setUsers] = useState<string[]>(['@spam_guy_42', '@bot_farm_xx']);

  const removeCategory = (name: string) => setCategories((prev) => prev.filter((c) => c !== name));
  const removeUser = (name: string) => setUsers((prev) => prev.filter((u) => u !== name));

  const addCategory = (name: string) => {
    setCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
  };

  const addUser = (handle: string) => {
    setUsers((prev) => (prev.includes(handle) ? prev : [...prev, handle]));
  };

  return (
    <SettingsSection
      id="moderation"
      title="Moderation"
      desc="Auto-block categories and words. Bad actors get refunded without bothering you."
    >
      <div style={{ marginBottom: '16px' }}>
        <FieldRow label="Auto-block categories">
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((c) => (
              <BlockChip key={c} label={c} onRemove={() => removeCategory(c)} />
            ))}
            <InlineAdd
              placeholder="+ add category"
              prompt="category…"
              onAdd={addCategory}
            />
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
        <div className="flex flex-wrap items-center gap-1.5">
          {users.map((u) => (
            <BlockChip key={u} label={u} onRemove={() => removeUser(u)} />
          ))}
          <InlineAdd
            placeholder="+ block user"
            prompt="@handle…"
            onAdd={addUser}
            normalize={(raw) => (raw.startsWith('@') ? raw : `@${raw}`)}
          />
        </div>
      </FieldRow>
    </SettingsSection>
  );
}
