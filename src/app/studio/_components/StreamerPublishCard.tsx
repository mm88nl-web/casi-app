'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export type PublishableElement = {
  id: string;
  shape: string | null;
  is_background: boolean | null;
};

// Hard bucket limit (see supabase/migrations/20260415360000_create_beams_bucket.sql) —
// the bucket itself rejects anything over 5 MB regardless of type.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export default function StreamerPublishCard({
  elements,
  publishing,
  onPublish,
}: {
  elements: PublishableElement[];
  publishing: boolean;
  onPublish: (elementId: string, imageUrl: string, fileType: 'image' | 'video', durationMinutes: number, storagePath: string | null) => void;
}) {
  const supabase = createClient();
  const [elementId, setElementId] = useState('');
  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [fileType, setFileType] = useState<'image' | 'video'>('image');
  const [durationValue, setDurationValue] = useState(30);
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours'>('minutes');

  const activeUrl = mode === 'upload' ? uploadedUrl : imageUrl.trim();
  const durationMinutes = durationUnit === 'hours' ? durationValue * 60 : durationValue;
  const canPublish = !!elementId && !!activeUrl && durationValue > 0 && !publishing && !uploading;

  const handleFile = async (file: File) => {
    setUploadError('');
    const detectedType: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`File too large — max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`);
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const path = `self-published/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('beams').upload(path, file, { contentType: file.type });
    if (upErr) {
      setUploadError('Upload failed — try again');
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('beams').getPublicUrl(path);
    setUploadedUrl(publicUrl);
    setUploadedPath(path);
    setFileType(detectedType);
    setUploading(false);
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
      <h3 className="font-mono uppercase text-sm" style={{ color: 'var(--ink)' }}>
        Publish my own content
      </h3>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Puts an image/video straight on your overlay — no payment, no approval step.
        Kicks whatever's currently active on that slot (a viewer&apos;s approved booking can
        take this back over whenever they show up).
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

      <div className="flex gap-3 text-xs" style={{ color: 'var(--text-3)' }}>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === 'link'} onChange={() => setMode('link')} />
          Paste a link
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === 'upload'} onChange={() => setMode('upload')} />
          Upload from computer
        </label>
      </div>

      {mode === 'link' ? (
        <input
          type="text"
          placeholder="Image or video URL"
          className="rounded border px-2 py-1 text-sm bg-transparent"
          style={{ borderColor: 'var(--line)' }}
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            className="text-xs"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {uploading && <span className="text-xs" style={{ color: 'var(--text-3)' }}>Uploading...</span>}
          {uploadError && <span className="text-xs" style={{ color: '#e88' }}>{uploadError}</span>}
          {uploadedUrl && !uploading && (
            <span className="text-xs" style={{ color: 'var(--ink)' }}>Uploaded ✓</span>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <select
          className="rounded border px-2 py-1 text-sm bg-transparent"
          style={{ borderColor: 'var(--line)' }}
          value={fileType}
          onChange={(e) => setFileType(e.target.value as 'image' | 'video')}
          disabled={mode === 'upload'}
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        <input
          type="number"
          min={1}
          max={durationUnit === 'hours' ? 24 : 1440}
          className="w-20 rounded border px-2 py-1 text-sm bg-transparent"
          style={{ borderColor: 'var(--line)' }}
          value={durationValue}
          onChange={(e) => setDurationValue(Number(e.target.value) || 0)}
        />
        <select
          className="rounded border px-2 py-1 text-sm bg-transparent"
          style={{ borderColor: 'var(--line)' }}
          value={durationUnit}
          onChange={(e) => setDurationUnit(e.target.value as 'minutes' | 'hours')}
        >
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
        </select>
      </div>

      <button
        type="button"
        disabled={!canPublish}
        onClick={() => onPublish(elementId, activeUrl, fileType, durationMinutes, mode === 'upload' ? uploadedPath : null)}
        className="rounded px-3 py-2 text-sm font-semibold disabled:opacity-40"
        style={{ background: 'var(--ink)', color: 'var(--paper)' }}
      >
        {publishing ? 'Publishing...' : 'Publish now'}
      </button>
    </section>
  );
}
