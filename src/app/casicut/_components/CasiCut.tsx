'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { CasiMark } from '@/components/v9/CasiMark';
import { Wordmark } from '@/components/v9/Wordmark';

type JobStatus = 'pending' | 'transcribing' | 'selecting' | 'rendering' | 'uploading' | 'done' | 'error';

interface CasicutJob {
  id: string;
  vod_filename: string;
  status: JobStatus;
  error_msg: string | null;
  clips_count: number;
  created_at: string;
}

interface CasicutClip {
  id: string;
  job_id: string;
  title: string;
  hook_line: string | null;
  start_seconds: number;
  end_seconds: number;
  clip_path: string | null;
  posted_youtube: boolean;
  posted_tiktok: boolean;
  youtube_url: string | null;
  tiktok_url: string | null;
}

const STATUS_STEPS: { key: JobStatus; label: string }[] = [
  { key: 'pending',      label: 'Queued' },
  { key: 'transcribing', label: 'Transcribing audio…' },
  { key: 'selecting',    label: 'Claude is picking the best moments…' },
  { key: 'rendering',    label: 'Rendering clips…' },
  { key: 'uploading',    label: 'Uploading clips…' },
  { key: 'done',         label: 'Done' },
];

const STATUS_ORDER: Record<JobStatus, number> = {
  pending: 0, transcribing: 1, selecting: 2, rendering: 3, uploading: 4, done: 5, error: 6,
};

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtBytes(b: number): string {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  return `${(b / 1e6).toFixed(0)} MB`;
}

export default function CasiCut({ userId }: { userId: string }) {
  const supabase = createClient();

  const [phase, setPhase] = useState<'upload' | 'processing' | 'done'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [job, setJob] = useState<CasicutJob | null>(null);
  const [clips, setClips] = useState<CasicutClip[]>([]);
  const [clipUrls, setClipUrls] = useState<Record<string, string>>({});
  const [pastJobs, setPastJobs] = useState<CasicutJob[]>([]);
  const [posting, setPosting] = useState<Record<string, string>>({});
  const [postError, setPostError] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // load past jobs on mount, and resume any in-flight job (survives reload)
  useEffect(() => {
    supabase
      .from('casicut_jobs')
      .select('id, vod_filename, status, error_msg, clips_count, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data) return;
        const jobs = data as CasicutJob[];
        setPastJobs(jobs);
        const active = jobs.find(j =>
          !['done', 'error'].includes(j.status));
        if (active) {
          setJob(active);
          setPhase('processing');
          subscribeToJob(active.id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const loadClips = useCallback(async (jobId: string) => {
    const { data } = await supabase
      .from('casicut_clips')
      .select('*')
      .eq('job_id', jobId)
      .order('start_seconds');
    if (!data) return;
    setClips(data as CasicutClip[]);

    // get signed URLs for clips that have been rendered
    const urls: Record<string, string> = {};
    await Promise.all(
      (data as CasicutClip[])
        .filter(c => c.clip_path)
        .map(async c => {
          const { data: signed } = await supabase.storage
            .from('casicut-clips')
            .createSignedUrl(c.clip_path!.replace('casicut-clips/', ''), 3600);
          if (signed?.signedUrl) urls[c.id] = signed.signedUrl;
        })
    );
    setClipUrls(urls);
  }, [supabase]);

  const subscribeToJob = useCallback((jobId: string) => {
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    const channel = supabase
      .channel(`casicut_job_${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'casicut_jobs',
        filter: `id=eq.${jobId}`,
      }, ({ new: updated }) => {
        const j = updated as CasicutJob;
        setJob(j);
        if (j.status === 'done') {
          setPhase('done');
          loadClips(jobId);
        }
      })
      .subscribe();
    realtimeRef.current = channel;
  }, [supabase, loadClips]);

  useEffect(() => {
    return () => { if (realtimeRef.current) supabase.removeChannel(realtimeRef.current); };
  }, [supabase]);

  // C5: realtime can miss the terminal 'done' event (reconnect, backgrounded
  // tab, replication hiccup). Poll as a safety net while processing.
  useEffect(() => {
    if (phase !== 'processing' || !job) return;
    const id = setInterval(async () => {
      const { data } = await supabase
        .from('casicut_jobs')
        .select('id, vod_filename, status, error_msg, clips_count, created_at')
        .eq('id', job.id)
        .single();
      if (!data) return;
      const j = data as CasicutJob;
      setJob(j);
      if (j.status === 'done') { setPhase('done'); loadClips(j.id); }
    }, 8000);
    return () => clearInterval(id);
  }, [phase, job, supabase, loadClips]);

  const acceptFile = (f: File) => {
    const ok = ['video/mp4', 'video/x-matroska', 'video/quicktime', 'video/webm'].includes(f.type)
      || f.name.match(/\.(mp4|mkv|mov|webm)$/i);
    if (!ok) { setUploadError('Unsupported format. Use .mp4, .mkv, .mov, or .webm'); return; }
    if (f.size > 10 * 1024 ** 3) { setUploadError('File too large — max 10 GB'); return; }
    setUploadError(null);
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  };

  const handleProcess = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      const jobId = crypto.randomUUID();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const vodPath = `${userId}/${jobId}_${safeName}`;

      // supabase-js v2 .upload() uses fetch() with no byte-level progress
      // callback, so we can't show a real percentage. Show an indeterminate
      // uploading state instead of a fake bar stuck at 0%.
      const { error: upErr } = await supabase.storage
        .from('casicut-vods')
        .upload(vodPath, file, {
          cacheControl: '3600',
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);

      const { data: newJob, error: dbErr } = await supabase
        .from('casicut_jobs')
        .insert({
          id: jobId,
          user_id: userId,
          vod_filename: file.name,
          vod_path: `casicut-vods/${vodPath}`,
          status: 'pending',
        })
        .select()
        .single();
      if (dbErr) throw new Error(dbErr.message);

      setJob(newJob as CasicutJob);
      setPhase('processing');
      subscribeToJob(jobId);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handlePost = async (clipId: string, platform: 'youtube' | 'tiktok') => {
    setPosting(p => ({ ...p, [`${clipId}-${platform}`]: 'posting' }));
    try {
      const res = await fetch(`/api/casicut/post-${platform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip_id: clipId }),
      });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Post failed');
      setPosting(p => ({ ...p, [`${clipId}-${platform}`]: 'done' }));
      if (json.url) {
        setClips(cs => cs.map(c => c.id === clipId
          ? { ...c,
              [`posted_${platform}`]: true,
              [`${platform}_url`]: json.url,
            }
          : c
        ));
      }
    } catch (e) {
      setPosting(p => ({ ...p, [`${clipId}-${platform}`]: 'error' }));
      setPostError(p => ({ ...p, [`${clipId}-${platform}`]: e instanceof Error ? e.message : 'Post failed' }));
    }
  };

  const reset = () => {
    setPhase('upload');
    setFile(null);
    setJob(null);
    setClips([]);
    setClipUrls({});
    setUploadError(null);
    if (realtimeRef.current) { supabase.removeChannel(realtimeRef.current); realtimeRef.current = null; }
  };

  return (
    <div className="cc">
      <header className="hdr">
        <Link href="/" className="brand" aria-label="Casi home">
          <CasiMark width={28} height={14} className="brand-mark" />
          <Wordmark />
        </Link>
        <span className="tag">casiCut</span>
        <Link href="/studio" className="studio-link">studio</Link>
      </header>

      <main className="body">
        {phase === 'upload' && (
          <div className="upload-wrap">
            <div
              className={`dropzone${dragOver ? ' over' : ''}${file ? ' has-file' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && !file && fileInputRef.current?.click()}
              aria-label="Drop VOD file or click to select"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.mkv,.mov,.webm,video/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
              />
              {file ? (
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{fmtBytes(file.size)}</span>
                  <button className="change-btn" onClick={e => { e.stopPropagation(); setFile(null); }}>
                    change
                  </button>
                </div>
              ) : (
                <>
                  <div className="drop-icon" aria-hidden>▽</div>
                  <p className="drop-label">Drop your VOD.</p>
                  <p className="drop-sub">.mp4 · .mkv · .mov · up to 10 GB</p>
                </>
              )}
            </div>

            {uploadError && <p className="err">{uploadError}</p>}

            {uploading ? (
              <div className="progress-wrap">
                <div className="progress-bar indeterminate">
                  <div className="progress-fill" />
                </div>
                <span className="progress-pct">uploading…</span>
              </div>
            ) : (
              <button
                className="process-btn"
                disabled={!file}
                onClick={handleProcess}
              >
                Find clips
              </button>
            )}

            {pastJobs.length > 0 && (
              <section className="past">
                <h2 className="past-title">Past jobs</h2>
                <ul className="past-list">
                  {pastJobs.map(j => (
                    <li key={j.id} className="past-item">
                      <span className="past-name">{j.vod_filename}</span>
                      <span className={`past-status s-${j.status}`}>{j.status}</span>
                      {j.status === 'done' && (
                        <span className="past-clips">{j.clips_count} clips</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {phase === 'processing' && job && (
          <div className="processing-wrap">
            <p className="proc-file">{job.vod_filename}</p>
            <ul className="timeline" role="list">
              {STATUS_STEPS.map((step, i) => {
                const current = STATUS_ORDER[job.status];
                const stepOrder = STATUS_ORDER[step.key];
                const done = stepOrder < current;
                const active = step.key === job.status;
                return (
                  <li key={step.key} className={`tl-item${done ? ' done' : active ? ' active' : ''}`}>
                    <div className="tl-dot" aria-hidden />
                    {i < STATUS_STEPS.length - 1 && <div className="tl-line" aria-hidden />}
                    <span className="tl-label">{step.label}</span>
                  </li>
                );
              })}
            </ul>
            {job.status === 'error' && (
              <div className="proc-error">
                <p>{job.error_msg ?? 'Something went wrong.'}</p>
                <button className="process-btn" onClick={reset}>Try again</button>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && job && (
          <div className="clips-wrap">
            <div className="clips-hd">
              <h2 className="clips-title">{job.clips_count} clips ready.</h2>
              <button className="new-btn" onClick={reset}>Process another VOD</button>
            </div>
            <div className="clips-grid">
              {clips.map(clip => (
                <div key={clip.id} className="clip-card">
                  {clipUrls[clip.id] ? (
                    <video
                      src={clipUrls[clip.id]}
                      className="clip-video"
                      controls
                      playsInline
                      preload="metadata"
                      aria-label={clip.title}
                    />
                  ) : (
                    <div className="clip-placeholder" aria-hidden />
                  )}
                  <div className="clip-body">
                    <p className="clip-title">{clip.title}</p>
                    {clip.hook_line && <p className="clip-hook">{clip.hook_line}</p>}
                    <p className="clip-dur">{fmtDuration(clip.end_seconds - clip.start_seconds)}</p>
                    <div className="clip-actions">
                      {clip.posted_youtube && clip.youtube_url ? (
                        <a href={clip.youtube_url} target="_blank" rel="noopener noreferrer" className="posted-link">↗ YouTube</a>
                      ) : (
                        <button
                          className="post-btn yt"
                          disabled={!!posting[`${clip.id}-youtube`]}
                          onClick={() => handlePost(clip.id, 'youtube')}
                        >
                          {posting[`${clip.id}-youtube`] === 'posting' ? 'Posting…'
                            : posting[`${clip.id}-youtube`] === 'error' ? 'Failed — retry'
                            : 'Post to YouTube'}
                        </button>
                      )}
                      {clip.posted_tiktok && clip.tiktok_url ? (
                        <a href={clip.tiktok_url} target="_blank" rel="noopener noreferrer" className="posted-link">↗ TikTok</a>
                      ) : (
                        <button
                          className="post-btn tt"
                          disabled={!!posting[`${clip.id}-tiktok`]}
                          onClick={() => handlePost(clip.id, 'tiktok')}
                        >
                          {posting[`${clip.id}-tiktok`] === 'posting' ? 'Posting…'
                            : posting[`${clip.id}-tiktok`] === 'error' ? 'Failed — retry'
                            : 'Post to TikTok'}
                        </button>
                      )}
                    </div>
                    {(postError[`${clip.id}-youtube`] || postError[`${clip.id}-tiktok`]) && (
                      <p className="clip-err">
                        {postError[`${clip.id}-youtube`] || postError[`${clip.id}-tiktok`]}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .cc {
          --ink: #0DCFB0;
          --paper: #0C0D11;
          --H: var(--font-casi-display), 'Bricolage Grotesque', system-ui, sans-serif;
          --M: var(--font-casi-mono), 'JetBrains Mono', ui-monospace, monospace;
          --S: var(--font-casi-serif), 'Instrument Serif', Georgia, serif;
          min-height: 100dvh;
          background: var(--paper);
          color: #f3f5f4;
          font-family: var(--H);
          display: flex;
          flex-direction: column;
        }

        /* ── header ── */
        .hdr {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 32px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .brand {
          display: flex; align-items: center; gap: 7px;
          color: var(--ink); text-decoration: none;
        }
        .brand :global(.brand-mark) { color: var(--ink); }
        .brand :global(.casi-v9-wordmark) {
          font-family: var(--H); font-weight: 800; font-size: 20px;
          letter-spacing: -0.03em; color: #f3f5f4;
        }
        .brand :global(.casi-v9-wordmark .casi-v9-dot) { color: var(--ink); }
        .tag {
          font-family: var(--M); font-size: 10px; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--ink);
          background: color-mix(in srgb, var(--ink) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--ink) 28%, transparent);
          border-radius: 99px; padding: 3px 10px;
        }
        .studio-link {
          margin-left: auto;
          font-family: var(--S); font-style: italic; font-size: 15px;
          color: rgba(243,245,244,0.5); text-decoration: none;
          border-bottom: 1px solid rgba(243,245,244,0.15);
        }
        .studio-link:hover { color: #f3f5f4; }

        /* ── body ── */
        .body {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 60px 24px 80px;
        }

        /* ── upload ── */
        .upload-wrap {
          width: 100%; max-width: 540px;
          display: flex; flex-direction: column; gap: 20px;
        }
        .dropzone {
          border: 2px dashed color-mix(in srgb, var(--ink) 35%, transparent);
          border-radius: 18px;
          padding: 60px 32px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.18s, background 0.18s;
          background: color-mix(in srgb, var(--ink) 4%, transparent);
        }
        .dropzone:hover, .dropzone.over {
          border-color: var(--ink);
          background: color-mix(in srgb, var(--ink) 8%, transparent);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--ink) 10%, transparent);
        }
        .dropzone.has-file {
          border-style: solid;
          border-color: color-mix(in srgb, var(--ink) 55%, transparent);
          cursor: default;
          padding: 28px 32px;
        }
        .drop-icon {
          font-size: 36px; color: var(--ink); margin-bottom: 14px; opacity: 0.7;
        }
        .drop-label {
          font-family: var(--H); font-weight: 700; font-size: 22px;
          letter-spacing: -0.02em; margin: 0 0 8px;
        }
        .drop-sub {
          font-family: var(--M); font-size: 11px; letter-spacing: 0.14em;
          text-transform: uppercase; color: rgba(243,245,244,0.4); margin: 0;
        }
        .file-info {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          justify-content: center;
        }
        .file-name {
          font-family: var(--M); font-size: 13px; color: #f3f5f4;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;
        }
        .file-size {
          font-family: var(--M); font-size: 11px; color: rgba(243,245,244,0.45);
        }
        .change-btn {
          font-family: var(--S); font-style: italic; font-size: 13px;
          background: none; border: none; color: var(--ink); cursor: pointer;
          padding: 0; text-decoration: underline;
        }
        .err {
          font-family: var(--M); font-size: 12px; color: #e05444;
          margin: 0; text-align: center;
        }
        .progress-wrap {
          display: flex; align-items: center; gap: 12px;
        }
        .progress-bar {
          flex: 1; height: 4px; border-radius: 99px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .progress-fill {
          height: 100%; border-radius: 99px;
          background: var(--ink);
          transition: width 0.2s;
        }
        .progress-bar.indeterminate { position: relative; }
        .progress-bar.indeterminate .progress-fill {
          position: absolute;
          width: 40%;
          animation: indet 1.2s ease-in-out infinite;
        }
        @keyframes indet {
          0%   { left: -40%; }
          100% { left: 100%; }
        }
        .progress-pct {
          font-family: var(--M); font-size: 11px;
          color: rgba(243,245,244,0.5); white-space: nowrap; min-width: 60px;
        }
        .process-btn {
          font-family: var(--H); font-weight: 700; font-size: 15px;
          background: var(--ink); color: var(--paper);
          border: none; border-radius: 999px; padding: 13px 32px;
          cursor: pointer; align-self: center;
          transition: opacity 0.15s;
        }
        .process-btn:disabled { opacity: 0.35; cursor: default; }
        .process-btn:hover:not(:disabled) { opacity: 0.88; }

        /* ── past jobs ── */
        .past { margin-top: 12px; }
        .past-title {
          font-family: var(--M); font-size: 10px; letter-spacing: 0.18em;
          text-transform: uppercase; color: rgba(243,245,244,0.35);
          margin: 0 0 10px;
        }
        .past-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .past-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          font-family: var(--M); font-size: 12px;
        }
        .past-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(243,245,244,0.7); }
        .past-status { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
        .s-done { color: var(--ink); }
        .s-error { color: #e05444; }
        .s-pending, .s-transcribing, .s-selecting, .s-rendering, .s-uploading { color: rgba(243,245,244,0.4); }
        .past-clips { color: var(--ink); font-size: 11px; white-space: nowrap; }

        /* ── processing ── */
        .processing-wrap {
          width: 100%; max-width: 400px;
          display: flex; flex-direction: column; gap: 32px; align-items: center;
        }
        .proc-file {
          font-family: var(--M); font-size: 12px; color: rgba(243,245,244,0.45);
          margin: 0; text-align: center;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
        }
        .timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0; }
        .tl-item {
          display: grid;
          grid-template-columns: 20px 1fr;
          grid-template-rows: auto auto;
          column-gap: 14px;
          position: relative;
        }
        .tl-dot {
          grid-row: 1; grid-column: 1;
          width: 12px; height: 12px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.15);
          background: transparent;
          margin-top: 3px;
          justify-self: center;
          transition: background 0.2s, border-color 0.2s;
        }
        .tl-line {
          grid-row: 2; grid-column: 1;
          width: 2px; height: 28px;
          background: rgba(255,255,255,0.08);
          justify-self: center;
        }
        .tl-label {
          grid-row: 1; grid-column: 2;
          font-family: var(--H); font-size: 14px;
          color: rgba(243,245,244,0.35);
          padding-top: 1px;
          align-self: start;
        }
        .tl-item.done .tl-dot { background: var(--ink); border-color: var(--ink); }
        .tl-item.done .tl-line { background: color-mix(in srgb, var(--ink) 30%, transparent); }
        .tl-item.done .tl-label { color: rgba(243,245,244,0.5); }
        .tl-item.active .tl-dot {
          background: var(--ink); border-color: var(--ink);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--ink) 22%, transparent);
          animation: pulse 1.6s ease-out infinite;
        }
        .tl-item.active .tl-label { color: #f3f5f4; font-weight: 600; }
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0   color-mix(in srgb, var(--ink) 40%, transparent); }
          100% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--ink)  0%, transparent); }
        }
        .proc-error { text-align: center; display: flex; flex-direction: column; gap: 12px; }
        .proc-error p { font-size: 14px; color: #e05444; margin: 0; }

        /* ── clips ── */
        .clips-wrap { width: 100%; max-width: 900px; }
        .clips-hd {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 16px; margin-bottom: 28px; flex-wrap: wrap;
        }
        .clips-title {
          font-family: var(--H); font-weight: 800; font-size: 28px;
          letter-spacing: -0.03em; margin: 0;
        }
        .new-btn {
          font-family: var(--S); font-style: italic; font-size: 15px;
          background: none; border: none; color: var(--ink);
          cursor: pointer; padding: 0;
          border-bottom: 1px solid color-mix(in srgb, var(--ink) 40%, transparent);
        }
        .clips-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        .clip-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          overflow: hidden;
          transition: border-color 0.18s, transform 0.18s;
        }
        .clip-card:hover { border-color: rgba(255,255,255,0.16); transform: translateY(-2px); }
        .clip-video {
          width: 100%; aspect-ratio: 9/16; object-fit: cover;
          display: block; background: #1a1c2c; max-height: 340px;
        }
        .clip-placeholder {
          width: 100%; aspect-ratio: 9/16; max-height: 340px;
          background: rgba(255,255,255,0.04);
        }
        .clip-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
        .clip-title {
          font-family: var(--H); font-weight: 700; font-size: 15px;
          letter-spacing: -0.01em; margin: 0; color: #f3f5f4;
        }
        .clip-hook {
          font-family: var(--S); font-style: italic; font-size: 13px;
          color: rgba(243,245,244,0.55); margin: 0;
        }
        .clip-dur {
          font-family: var(--M); font-size: 11px; letter-spacing: 0.08em;
          color: rgba(243,245,244,0.35); margin: 0;
        }
        .clip-actions { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .post-btn {
          font-family: var(--M); font-size: 11px; letter-spacing: 0.06em;
          border: 1px solid; border-radius: 8px; padding: 6px 12px;
          cursor: pointer; background: transparent;
          transition: opacity 0.15s;
        }
        .post-btn:disabled { opacity: 0.4; cursor: default; }
        .post-btn.yt { color: #ff4444; border-color: rgba(255,68,68,0.35); }
        .post-btn.yt:hover:not(:disabled) { background: rgba(255,68,68,0.08); }
        .post-btn.tt { color: #f3f5f4; border-color: rgba(243,245,244,0.2); }
        .post-btn.tt:hover:not(:disabled) { background: rgba(243,245,244,0.05); }
        .posted-link {
          font-family: var(--M); font-size: 11px; letter-spacing: 0.06em;
          color: var(--ink); text-decoration: none;
          border-bottom: 1px solid color-mix(in srgb, var(--ink) 40%, transparent);
        }
        .clip-err {
          font-family: var(--M); font-size: 10px; line-height: 1.4;
          color: #e05444; margin: 8px 0 0;
        }

        @media (max-width: 600px) {
          .hdr { padding: 12px 18px; }
          .body { padding: 32px 16px 60px; }
          .dropzone { padding: 40px 20px; }
          .clips-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
