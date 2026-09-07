'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// Hard bucket limit (see supabase/migrations/20260415360000_create_beams_bucket.sql) —
// the bucket itself rejects anything over 5 MB regardless of type.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Same shape → clip-path mapping CustomizePanel.tsx uses for the viewer's
// booking preview — kept in sync there rather than shared, since the two
// components' clip needs (a full drag/zoom rig vs a static look-ahead) are
// different enough that a shared helper would need its own prop surface.
const SHAPE_CSS: Record<string, string> = {
  rect:    'none',
  rounded: 'inset(0 round 14px)',
  circle:  'circle(50%)',
};
const PUBLISH_PREVIEW_CLIP_ID = 'casi-publish-preview-clip';
const PREVIEW_MAX_HEIGHT = 160;

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
  shape,
  clipPathSvg,
  cornerRadius,
  slotAspectRatio,
}: {
  elementId: string;
  publishing: boolean;
  onPublish: (elementId: string, imageUrl: string, fileType: 'image' | 'video', storagePath: string | null) => void;
  /** Slot's real shape (rect/circle/custom/…) — drives the preview's clip,
   *  same technique CustomizePanel uses for the viewer-facing booking form.
   *  Publish-my-own skips the drag/zoom rig entirely (no offset/zoom is
   *  ever sent to onPublish), so the preview always renders at the
   *  default center/zoom=1 crop — exactly what actually gets published. */
  shape?: string | null;
  clipPathSvg?: string | null;
  cornerRadius?: number | null;
  slotAspectRatio: number;
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

  // Same clip technique CustomizePanel uses for the viewer's booking form —
  // 'custom' resolves to the slot's real clip_path_svg via an SVG <clipPath>
  // url(), everything else is a plain CSS clip-path (or none, for rect,
  // which uses cornerRadius via border-radius instead).
  const previewMaskCss =
    shape === 'custom'
      ? (clipPathSvg ? `url(#${PUBLISH_PREVIEW_CLIP_ID})` : 'circle(50%)')
      : SHAPE_CSS[shape ?? 'rect'] ?? 'none';
  // No offset/zoom controls here — publish-my-own always ships at the
  // default center crop, so 'cover' for circle/custom (they can't sensibly
  // letterbox) and 'contain' for rect/rounded (shows the whole image,
  // matching what a fresh unzoomed booking would look like) is the same
  // rule CustomizePanel applies at its own zoom===default state.
  const previewObjectFit: 'cover' | 'contain' = shape === 'circle' || shape === 'custom' ? 'cover' : 'contain';

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

      {/* Preview — this publishes instantly with no approval step, so
          there's no second chance to catch a wrong crop or a broken link
          before it's live on stream. Clips to the slot's real shape/aspect
          ratio the same way the viewer-facing booking preview does. */}
      {shape === 'custom' && clipPathSvg && (
        <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <clipPath id={PUBLISH_PREVIEW_CLIP_ID} clipPathUnits="objectBoundingBox">
              <path d={clipPathSvg} />
            </clipPath>
          </defs>
        </svg>
      )}
      <div>
        <div className="casi-v9-cp-lbl" style={{ marginBottom: 6 }}>Preview</div>
        <div
          style={{
            // Same width-derived-from-height-cap approach CustomizePanel
            // uses — deriving width from the height cap (instead of
            // capping height independently alongside a separate aspectRatio)
            // keeps the ratio itself from ever being silently overridden.
            width: `min(100%, ${PREVIEW_MAX_HEIGHT * slotAspectRatio}px)`,
            aspectRatio: slotAspectRatio,
            background: 'var(--paper-2)',
            border: '1px solid var(--line)',
            borderRadius: shape === 'rect' || !shape ? (cornerRadius ?? 0) : 8,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {activeUrl ? (
            <div style={{ position: 'absolute', inset: 0, clipPath: previewMaskCss === 'none' ? undefined : previewMaskCss }}>
              {activeFileType === 'video' ? (
                <video
                  src={activeUrl}
                  autoPlay muted loop playsInline
                  style={{ width: '100%', height: '100%', objectFit: previewObjectFit }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: previewObjectFit }}
                />
              )}
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontFamily: 'var(--M)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
              Paste a link or upload a file
            </div>
          )}
        </div>
      </div>

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
