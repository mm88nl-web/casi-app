'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// Hard bucket limit (see supabase/migrations/20260415360000_create_beams_bucket.sql) —
// the bucket itself rejects anything over 5 MB regardless of type.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Same detection overlay/page.tsx uses for a pasted booking URL — lets a
// pasted link auto-detect image vs video instead of asking the streamer to
// pick from a dropdown that was disabled half the time anyway (upload mode
// already knows the real type from the file's MIME type).
function getUrlFileType(url: string): 'image' | 'video' {
  const path = url.toLowerCase().split('?')[0];
  return /\.(mp4|webm|mov|ogv)$/.test(path) ? 'video' : 'image';
}

/**
 * Publish-my-own-content — lives inside a beam's own Properties panel now
 * (one specific slot, already selected in the Layers tab) rather than as a
 * standalone dashboard card with its own "choose a slot" dropdown. The
 * slot is implicit: whichever beam this panel is currently showing.
 */
export default function StreamerPublishCard({
  elementId,
  publishing,
  onPublish,
}: {
  elementId: string;
  publishing: boolean;
  onPublish: (elementId: string, imageUrl: string, fileType: 'image' | 'video', storagePath: string | null) => void;
}) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadedFileType, setUploadedFileType] = useState<'image' | 'video'>('image');

  const activeUrl = mode === 'upload' ? uploadedUrl : imageUrl.trim();
  // Upload mode knows the real type from the file's MIME type; link mode
  // detects it from the URL's extension — no manual picker needed either way.
  const activeFileType = mode === 'upload' ? uploadedFileType : getUrlFileType(imageUrl);
  const canPublish = !!elementId && !!activeUrl && !publishing && !uploading;

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
    setUploadedFileType(detectedType);
    setUploading(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="casi-v9-cp-lbl">Publish my own content</div>
      <p style={{ fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: '13px', color: 'var(--text-3)' }}>
        Put something on this slot instantly — no payment, no approval, no timer.
      </p>

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
          className="text-sm bg-transparent"
          style={{ borderRadius: 'var(--radius-chip)', border: '1px solid var(--line)', padding: '8px 10px', fontFamily: 'var(--M)', color: 'var(--text)' }}
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
      ) : (
        <div className="flex flex-col gap-1.5" style={{ alignItems: 'flex-start' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {/* Was a bare native file input (browser-default "Choose File",
              easy to miss) — now a real button, same weight as Publish
              below it, since it's the button you actually need to click
              first in upload mode. */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="disabled:opacity-40"
            style={{
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--ink)',
              color: 'var(--ink)',
              background: 'transparent',
              padding: '9px 16px',
              fontFamily: 'var(--B)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: uploading ? 'wait' : 'pointer',
            }}
          >
            {uploading ? 'Uploading…' : uploadedUrl ? 'Replace file' : 'Choose file →'}
          </button>
          {uploadError && <span className="text-xs" style={{ color: '#e88' }}>{uploadError}</span>}
          {uploadedUrl && !uploading && (
            <span className="text-xs" style={{ color: 'var(--ink)' }}>Uploaded ✓</span>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!canPublish}
        onClick={() => onPublish(elementId, activeUrl, activeFileType, mode === 'upload' ? uploadedPath : null)}
        className="casi-pill-solid disabled:opacity-40"
        style={{ padding: '10px 18px', fontSize: '14px', alignSelf: 'flex-start' }}
      >
        {publishing ? 'Publishing...' : 'Publish now'}
      </button>
    </div>
  );
}
