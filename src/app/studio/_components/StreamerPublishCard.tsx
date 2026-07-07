'use client';

import { useState } from 'react';

export type PublishableElement = {
  id: string;
  shape: string | null;
  is_background: boolean | null;
};

export default function StreamerPublishCard({
  elements,
  publishing,
  onPublish,
}: {
  elements: PublishableElement[];
  publishing: boolean;
  onPublish: (elementId: string, imageUrl: string, fileType: 'image' | 'video', durationMinutes: number) => void;
}) {
  const [elementId, setElementId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [fileType, setFileType] = useState<'image' | 'video'>('image');
  const [durationMinutes, setDurationMinutes] = useState(30);

  const canPublish = !!elementId && !!imageUrl.trim() && durationMinutes > 0 && !publishing;

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
      <h3 className="font-mono uppercase text-sm" style={{ color: 'var(--ink)' }}>
        Publish my own content
      </h3>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Puts an image/video straight on your overlay — no payment, no approval step.
        Kicks whatever's currently active on that slot.
      </p>

      <select
        className="rounded border px-2 py-1 text-sm bg-transparent"
        style={{ borderColor: 'var(--line)' }}
        value={elementId}
        onChange={(e) => setElementId(e.target.value)}
      >
        <option value="">Choose a slot...</option>
        {elements.map((el) => (
          <option key={el.id} value={el.id}>
            {el.is_background ? 'Backdrop' : (el.shape ?? 'slot')} ({el.id.slice(0, 8)})
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Image or video URL"
        className="rounded border px-2 py-1 text-sm bg-transparent"
        style={{ borderColor: 'var(--line)' }}
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />

      <div className="flex gap-2 items-center">
        <select
          className="rounded border px-2 py-1 text-sm bg-transparent"
          style={{ borderColor: 'var(--line)' }}
          value={fileType}
          onChange={(e) => setFileType(e.target.value as 'image' | 'video')}
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        <input
          type="number"
          min={1}
          max={1440}
          className="w-20 rounded border px-2 py-1 text-sm bg-transparent"
          style={{ borderColor: 'var(--line)' }}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
        />
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>minutes</span>
      </div>

      <button
        type="button"
        disabled={!canPublish}
        onClick={() => onPublish(elementId, imageUrl.trim(), fileType, durationMinutes)}
        className="rounded px-3 py-2 text-sm font-semibold disabled:opacity-40"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        {publishing ? 'Publishing...' : 'Publish now'}
      </button>
    </section>
  );
}
