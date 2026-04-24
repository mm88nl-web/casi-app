'use client';

import { useRef, useState } from 'react';

export type CreativeMode = 'file' | 'text';

type Props = {
  mode: CreativeMode;
  onModeChange: (next: CreativeMode) => void;
  textValue: string;
  onTextChange: (value: string) => void;
  clickThrough: string;
  onClickThroughChange: (value: string) => void;
};

const TEXT_MAX = 60;

export default function CreativePicker({
  mode,
  onModeChange,
  textValue,
  onTextChange,
  clickThrough,
  onClickThroughChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div>
      <div
        className="flex gap-1"
        style={{
          padding: '4px',
          background: 'var(--casi-bg)',
          border: '1px solid var(--casi-border-2)',
          borderRadius: '10px',
          marginBottom: '12px',
        }}
      >
        <SegButton active={mode === 'file'} onClick={() => onModeChange('file')}>
          <span aria-hidden>↑</span> Upload
        </SegButton>
        <SegButton active={mode === 'text'} onClick={() => onModeChange('text')}>
          <span aria-hidden>T</span> Text
        </SegButton>
      </div>

      {mode === 'file' ? (
        <div className="flex flex-col gap-2.5">
          <label
            className="flex items-center gap-3.5 cursor-pointer transition-colors"
            style={{
              padding: '20px',
              border: '2px dashed var(--casi-border-2)',
              borderRadius: '12px',
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '10px',
                background: 'rgba(var(--casi-accent-rgb), 0.1)',
                color: 'var(--casi-accent)',
                fontSize: '24px',
              }}
              aria-hidden
            >
              ↑
            </div>
            <div>
              <div
                className="font-bold"
                style={{ fontSize: '15px', marginBottom: '2px', color: 'var(--casi-text)' }}
              >
                {fileName ?? 'Drop a file or click'}
              </div>
              <div
                className="font-mono uppercase"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: 'var(--casi-text-dim)',
                }}
              >
                {fileName ? 'Click to replace · image or video · max 5MB' : 'Image or video · max 5MB'}
              </div>
            </div>
          </label>

          <div
            className="flex items-center gap-2.5"
            style={{
              padding: '10px 14px',
              background: 'var(--casi-bg)',
              border: '1px dashed var(--casi-border-2)',
              borderRadius: '10px',
            }}
          >
            <span
              className="font-mono uppercase whitespace-nowrap"
              style={{
                fontSize: '10px',
                letterSpacing: '0.16em',
                color: 'var(--casi-text-dim)',
              }}
            >
              Click-through · optional
            </span>
            <input
              value={clickThrough}
              onChange={(e) => onClickThroughChange(e.target.value)}
              placeholder="https:// where should clicks go?"
              className="flex-1 font-mono bg-transparent outline-none"
              style={{
                fontSize: '13px',
                color: 'var(--casi-text)',
                border: 'none',
              }}
            />
          </div>
        </div>
      ) : (
        <div>
          <input
            value={textValue}
            onChange={(e) => onTextChange(e.target.value.slice(0, TEXT_MAX))}
            placeholder="Say something short…"
            maxLength={TEXT_MAX}
            className="w-full font-bold outline-none transition-colors"
            style={{
              background: 'var(--casi-bg)',
              border: '2px solid var(--casi-border-2)',
              borderRadius: '12px',
              padding: '22px 20px',
              fontFamily: 'var(--font-casi-sans)',
              fontSize: '22px',
              color: 'var(--casi-text)',
              letterSpacing: '-0.3px',
            }}
          />
          <div
            className="flex items-center justify-between font-mono uppercase"
            style={{
              marginTop: '8px',
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: 'var(--casi-text-faint)',
            }}
          >
            <span>Plain text · no links</span>
            <span>
              {textValue.length}/{TEXT_MAX}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-2 font-bold transition-colors"
      style={{
        padding: '10px 12px',
        borderRadius: '7px',
        fontFamily: 'var(--font-casi-sans)',
        fontSize: '13px',
        color: active ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
        background: active ? 'var(--casi-surface)' : 'transparent',
        boxShadow: active ? 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' : 'none',
        cursor: 'pointer',
        border: 'none',
      }}
    >
      {children}
    </button>
  );
}
