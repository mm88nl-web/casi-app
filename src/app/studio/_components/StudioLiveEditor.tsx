'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Rnd } from 'react-rnd';
import SlotMedia from '@/components/SlotMedia';
import BeamCtrlPanel from './BeamCtrlPanel';
import StudioLayersPanel, { type LayerItem } from './StudioLayersPanel';
import { formatSlotPrice } from '@/lib/slot-pricing';

// Smart placement: find the first 4x4 grid cell with no nearby beam. Ported
// verbatim from admin/page.tsx so setup-surface inserts don't clash with
// the admin canvas when both are open in parallel tabs.
function findFreePosition(elements: any[]): { pos_x: number; pos_y: number } {
  const beams = elements.filter((el) => !el.is_background);
  const candidates = [
    { pos_x: 5, pos_y: 5 },  { pos_x: 30, pos_y: 5 },  { pos_x: 55, pos_y: 5 },  { pos_x: 75, pos_y: 5 },
    { pos_x: 5, pos_y: 30 }, { pos_x: 30, pos_y: 30 }, { pos_x: 55, pos_y: 30 }, { pos_x: 75, pos_y: 30 },
    { pos_x: 5, pos_y: 55 }, { pos_x: 30, pos_y: 55 }, { pos_x: 55, pos_y: 55 }, { pos_x: 75, pos_y: 55 },
    { pos_x: 5, pos_y: 70 }, { pos_x: 30, pos_y: 70 }, { pos_x: 55, pos_y: 70 }, { pos_x: 75, pos_y: 70 },
  ];
  for (const c of candidates) {
    const overlaps = beams.some((b) => {
      const dx = Math.abs(b.pos_x - c.pos_x);
      const dy = Math.abs(b.pos_y - c.pos_y);
      return dx < 18 && dy < 18;
    });
    if (!overlaps) return c;
  }
  const last = beams[beams.length - 1];
  return { pos_x: Math.min(75, (last?.pos_x ?? 5) + 5), pos_y: Math.min(70, (last?.pos_y ?? 5) + 5) };
}

type Props = {
  supabase: SupabaseClient;
  profileId: string;
  /** Streamer handle, used to render the OBS-source URL bar at the top of
   *  the editor. Falls back to a placeholder when missing. */
  username?: string | null;
  /** Stripe Connect's default currency for this streamer's account. Drives
   *  which Stripe currency row renders on the slot Pricing tab — we show
   *  the rate input in whatever currency Stripe will actually charge in,
   *  not in a free-form picker. null means Stripe isn't connected yet;
   *  the Stripe row is hidden and the streamer prices in USDC only. */
  stripeCurrency?: 'eur' | 'usd' | null;
  /** Called from the add-beam toolbar button (external header) so the parent
   *  can render the button in its own layout. Optional — if not provided,
   *  an internal button renders above the canvas. */
  onAddHandler?: (handler: () => void) => void;
};

export default function StudioLiveEditor({ supabase, profileId, username, stripeCurrency, onAddHandler }: Props) {
  const [elements, setElements] = useState<any[]>([]);
  // Map element_id → booking state: 'active' means a beam is currently
  // playing (glow + "Live" pill), 'queued' means approved and waiting.
  // Both gate the corner × delete button, matching the deleteLayer
  // guard so the "end early first" rule is visible in the UI.
  const [slotState, setSlotState] = useState<Record<string, 'active' | 'queued'>>({});
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [saveStatus, setSaveStatus] = useState<'Ready' | 'Saving…' | 'Saved'>('Ready');
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const sliderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedEl = elements.find((el) => el.id === selectedSlotId) ?? null;

  const showToast = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  };

  // Initial fetch: elements + any live/queued bookings so the slot render
  // can show the glow / "Live" pill / hide delete button.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [elementsRes, bookingsRes] = await Promise.all([
        supabase.from('overlay_elements').select('*').eq('profile_id', profileId),
        supabase.from('bookings')
          .select('element_id, status')
          .eq('profile_id', profileId)
          .in('status', ['active', 'approved_queued']),
      ]);
      if (cancelled) return;
      setElements(elementsRes.data || []);
      const map: Record<string, 'active' | 'queued'> = {};
      for (const b of bookingsRes.data || []) {
        if (!b.element_id) continue;
        // 'active' wins over 'queued' — a slot with an active beam might
        // also have queued bookings behind it.
        if (map[b.element_id] === 'active') continue;
        map[b.element_id] = b.status === 'active' ? 'active' : 'queued';
      }
      setSlotState(map);
    })();
    return () => { cancelled = true; };
  }, [supabase, profileId]);

  // Refresh slot state whenever a booking changes. Cheaper to re-query than
  // maintain a full reducer here; bookings mutate rarely compared to drag events.
  useEffect(() => {
    const channel = supabase
      .channel(`studio_editor_bookings_${profileId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profileId}` },
        async () => {
          const { data } = await supabase.from('bookings')
            .select('element_id, status')
            .eq('profile_id', profileId)
            .in('status', ['active', 'approved_queued']);
          const map: Record<string, 'active' | 'queued'> = {};
          for (const b of data || []) {
            if (!b.element_id) continue;
            if (map[b.element_id] === 'active') continue;
            map[b.element_id] = b.status === 'active' ? 'active' : 'queued';
          }
          setSlotState(map);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, profileId]);

  // Realtime sync — cron janitor, queue-advance, parallel admin tabs mutate
  // overlay_elements under us; stay in sync without forcing a refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`studio_live_editor_${profileId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'overlay_elements', filter: `profile_id=eq.${profileId}` },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setElements((prev) => (prev.some((e) => e.id === payload.new.id) ? prev : [...prev, payload.new]));
          } else if (payload.eventType === 'UPDATE') {
            setElements((prev) => prev.map((e) => (e.id === payload.new.id ? { ...e, ...payload.new } : e)));
          } else if (payload.eventType === 'DELETE') {
            setElements((prev) => prev.filter((e) => e.id !== payload.old.id));
            setSelectedSlotId((curr) => (curr === payload.old.id ? null : curr));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, profileId]);

  const setCanvasRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => {
      if (node.clientWidth > 0) setDimensions({ width: node.clientWidth, height: node.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const updateLayer = useCallback(async (id: string, updates: any) => {
    setSaveStatus('Saving…');
    const s = { ...updates };
    if (s.price_value !== undefined) s.price_value = parseFloat(s.price_value) || 0;
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...s } : el)));
    await supabase.from('overlay_elements').update(s).eq('id', id);
    setSaveStatus('Saved');
    setTimeout(() => setSaveStatus('Ready'), 2000);
  }, [supabase]);

  const updateSlider = useCallback((id: string, updates: any) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...updates } : el)));
    if (sliderSaveTimer.current) clearTimeout(sliderSaveTimer.current);
    sliderSaveTimer.current = setTimeout(async () => {
      await supabase.from('overlay_elements').update(updates).eq('id', id);
    }, 400);
  }, [supabase]);

  // Shape-change autosnap — same semantics as admin/page.tsx:
  //  - circle/hex → 9:16 pixel-square based on current height
  //  - banner → full-width bottom strip
  //  - backdrop → full-canvas, demotes prior backdrop so at most one is_background row exists
  const handleUpdateShape = useCallback(async (id: string, shape: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const patch: Record<string, unknown> = { shape };
    if (shape === 'circle' || shape === 'hex') {
      patch.width = Math.round(Number(el.height) * 9 / 16 * 100) / 100;
    } else if (shape === 'banner') {
      patch.width = 100; patch.height = 8; patch.pos_x = 0; patch.pos_y = 92; patch.is_background = false;
    } else if (shape === 'backdrop') {
      patch.width = 100; patch.height = 100; patch.pos_x = 0; patch.pos_y = 0; patch.is_background = true;
      const prior = elements.find((e) => e.id !== id && e.is_background);
      if (prior) await updateLayer(prior.id, { is_background: false, shape: 'rect' });
    } else if (el.is_background) {
      patch.is_background = false;
    }
    await updateLayer(id, patch);
  }, [elements, updateLayer]);

  const handleUpdateGlow = useCallback((id: string, glow: boolean) => {
    updateLayer(id, { glow_on_start: glow });
  }, [updateLayer]);

  const toggleLock = useCallback(async (id: string, locked: boolean) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, locked } : el)));
    await supabase.from('overlay_elements').update({ locked }).eq('id', id);
  }, [supabase]);

  const addBeam = useCallback(async () => {
    const freePos = findFreePosition(elements);
    const { data } = await supabase.from('overlay_elements').insert({
      profile_id: profileId, image_url: '',
      pos_x: freePos.pos_x, pos_y: freePos.pos_y,
      width: 20, height: 20,
      is_background: false, price_value: 0, price_unit: 'min', max_duration_minutes: null, locked: false,
    }).select().single();
    if (data) {
      setElements((prev) => [...prev, data]);
      setSelectedSlotId(data.id);
    }
  }, [supabase, profileId, elements]);

  // Expose addBeam to the parent (for an external toolbar button). Re-ref on
  // every dependency change so the handler captures the latest elements array.
  useEffect(() => {
    if (onAddHandler) onAddHandler(addBeam);
  }, [addBeam, onAddHandler]);

  // Delete guard — don't orphan a live or queued booking's on-chain escrow
  // by dropping the slot underneath it. Admin enforces the same invariant.
  const deleteLayer = useCallback(async (id: string) => {
    const { data: blocking } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('element_id', id)
      .in('status', ['active', 'approved_queued'])
      .limit(1);
    if (blocking && blocking.length > 0) {
      const hasActive = blocking.some((b: any) => b.status === 'active');
      showToast(
        hasActive
          ? 'End the live beam first — delete settles nothing on chain.'
          : 'Clear the queue first — viewers in line have funds locked.',
        'err',
      );
      return;
    }
    setSelectedSlotId((curr) => (curr === id ? null : curr));
    await supabase.from('overlay_elements').delete().eq('id', id);
    setElements((prev) => prev.filter((el) => el.id !== id));
  }, [supabase]);

  // Layers panel data — derived from elements + slotState.
  const layers: LayerItem[] = useMemo(() => {
    return elements.map((el) => {
      const live = slotState[el.id] === 'active';
      const queued = slotState[el.id] === 'queued';
      const status = live ? 'LIVE' : queued ? 'queued' : 'idle';
      // Pick the right rail to display from el.prices JSONB — the legacy
      // price_value column mirrors only the USD rate, which mis-labels
      // USDC-only and EUR-only slots as "$0/min" or hides them. The
      // helper falls back to price_value for slots predating the JSONB.
      const price = formatSlotPrice(el).label;
      return {
        id: el.id,
        shape: (el.shape as LayerItem['shape']) ?? 'rect',
        label: el.is_background
          ? 'Backdrop'
          : el.shape
          ? el.shape.charAt(0).toUpperCase() + el.shape.slice(1)
          : 'Beam',
        meta: `${price} · ${status}`,
        isLive: live,
        isLocked: !!el.locked,
        isBackground: !!el.is_background,
      };
    });
  }, [elements, slotState]);

  // Build the OBS source URL the streamer drops into OBS browser source.
  // Two OBS browser sources, stacked Z-order in the scene:
  //   1. Backdrop — full-bleed, sits behind everything (game, webcam, …)
  //   2. Beams    — shaped slot overlays + flash popups, on top
  //
  // /obs is chrome-less + transparent — the only correct URL to paste
  // into an OBS Browser Source. The legacy /overlay?s= URL is the
  // VIEWER booking page and was being mis-labeled as the OBS source
  // here, which is why streamers were seeing CASI nav chrome and cream
  // side-bars bleed into their scenes.
  const obsBackdropUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    return username ? `${origin}/obs?s=${username}&layer=backdrop` : '';
  }, [username]);
  const obsBeamsUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    return username ? `${origin}/obs?s=${username}&layer=beams` : '';
  }, [username]);

  const [copiedKey, setCopiedKey] = useState<'backdrop' | 'beams' | null>(null);
  const copyObsUrl = useCallback(async (kind: 'backdrop' | 'beams') => {
    const url = kind === 'backdrop' ? obsBackdropUrl : obsBeamsUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(kind);
      setTimeout(() => setCopiedKey((c) => (c === kind ? null : c)), 1800);
    } catch {
      showToast('Could not copy — check clipboard permissions', 'err');
    }
  }, [obsBackdropUrl, obsBeamsUrl]);

  // Lock toggle from the Layers panel — same path as the lock chip on the
  // selected slot but without requiring the canvas selection round-trip.
  const setLayerLocked = useCallback(
    async (id: string, currentlyLocked: boolean) => {
      const next = !currentlyLocked;
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, locked: next } : el)));
      await supabase.from('overlay_elements').update({ locked: next }).eq('id', id);
    },
    [supabase],
  );

  return (
    <>
      {toast ? (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          padding: '12px 20px', borderRadius: 10,
          fontFamily: 'var(--font-casi-mono), monospace', fontSize: 11, letterSpacing: 1, maxWidth: 420,
          background: toast.kind === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${toast.kind === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: toast.kind === 'ok' ? '#4ade80' : '#f87171',
        }}>{toast.msg}</div>
      ) : null}

      {/* v9 OBS-source URL bars — two browser sources at 1920×1080.
          Stack in OBS scene Z-order: Backdrop at the bottom, Beams on top. */}
      {!onAddHandler ? (
        <div className="casi-v9-le-url-stack">
          {(['backdrop', 'beams'] as const).map((kind) => {
            const url = kind === 'backdrop' ? obsBackdropUrl : obsBeamsUrl;
            const num = kind === 'backdrop' ? '1' : '2';
            const subtitle = kind === 'backdrop'
              ? 'Full-bleed · sits behind everything'
              : 'Shaped slots + 15s flashes · on top';
            return (
              <div key={kind} className="casi-v9-le-url">
                <span className="casi-v9-le-url-num" aria-hidden>{num}</span>
                <span className="casi-v9-le-url-lbl">
                  <span className="casi-v9-le-url-lbl-name">
                    {kind === 'backdrop' ? 'Backdrop' : 'Beams'}
                  </span>
                  <span className="casi-v9-le-url-lbl-sub">{subtitle}</span>
                </span>
                <span className="casi-v9-le-url-val">
                  {url ? (
                    <>
                      {url.replace(`?s=${username}&layer=${kind}`, `?s=`)}
                      <em>{username || 'streamer'}</em>
                      <span>&amp;layer={kind}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                <button type="button" className="casi-v9-le-url-cpy" onClick={() => copyObsUrl(kind)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="9" width="13" height="13" rx="1" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>{copiedKey === kind ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* v9 toolbar — status / +Beam. Edit/Preview toggle was removed —
          the editor is always in edit mode (grid + dashed outlines + delete
          handles). Streamers preview the live result via the OBS source URL
          shown above, not via a fake in-app preview. */}
      {!onAddHandler ? (
        <div className="casi-v9-le-toolbar">
          <span className="casi-v9-le-save">{saveStatus} · auto-saved</span>
          <button type="button" className="casi-v9-le-add" onClick={addBeam}>
            + Beam
          </button>
        </div>
      ) : null}

      {/* v9 3-col layout — Layers · Canvas · Properties */}
      <div className="casi-v9-le-grid3">

      <StudioLayersPanel
        layers={layers}
        selectedId={selectedSlotId}
        onSelect={(id) => setSelectedSlotId(id)}
        onAdd={addBeam}
        onToggleLock={setLayerLocked}
      />

      <div>
      <div
        className="canvas-wrap"
        ref={setCanvasRef}
        onClick={(e) => {
          if ((e.target as HTMLElement).classList.contains('canvas-wrap')) {
            setSelectedSlotId(null);
          }
        }}
      >
        <div className="casi-v9-canvas-grid-overlay" aria-hidden />
        {dimensions.width > 0 && elements.map((el) => {
          const isSelected = selectedSlotId === el.id;
          const state = slotState[el.id]; // 'active' | 'queued' | undefined
          const isActive = state === 'active';
          // Circle and hex shapes need a pixel-square box or the clip-path
          // collapses to an oval / flattened hex. The autosnap on shape
          // change + onResizeStop keep stored dims in ratio, but legacy
          // rows or partial saves can drift — clamp here so the rendered
          // box is always square regardless of what's in the DB.
          const isSquareShape = el.shape === 'circle' || el.shape === 'hex';
          const renderedWidthPx = el.is_background
            ? dimensions.width
            : isSquareShape
              ? Math.min((el.width / 100) * dimensions.width, (el.height / 100) * dimensions.height)
              : (el.width / 100) * dimensions.width;
          const renderedHeightPx = el.is_background
            ? dimensions.height
            : isSquareShape
              ? Math.min((el.width / 100) * dimensions.width, (el.height / 100) * dimensions.height)
              : (el.height / 100) * dimensions.height;
          return (
            <Rnd
              key={el.id}
              size={{
                width: el.is_background ? '100%' : `${renderedWidthPx}px`,
                height: el.is_background ? '100%' : `${renderedHeightPx}px`,
              }}
              position={{
                x: el.is_background ? 0 : (el.pos_x / 100) * dimensions.width,
                y: el.is_background ? 0 : (el.pos_y / 100) * dimensions.height,
              }}
              onDragStart={(_e, d) => {
                dragStartPos.current = { x: d.x, y: d.y };
                isDragging.current = false;
              }}
              onDrag={(_e, d) => {
                if (dragStartPos.current) {
                  const dist = Math.abs(d.x - dragStartPos.current.x) + Math.abs(d.y - dragStartPos.current.y);
                  if (dist > 6) isDragging.current = true;
                }
              }}
              onDragStop={(_e, d) => {
                if (!isDragging.current) {
                  setSelectedSlotId(el.id);
                } else {
                  updateLayer(el.id, {
                    pos_x: (d.x / dimensions.width) * 100,
                    pos_y: (d.y / dimensions.height) * 100,
                  });
                }
                isDragging.current = false;
              }}
              onResizeStop={(_e, _dir, ref, _delta, pos) => {
                const heightPct = (ref.offsetHeight / dimensions.height) * 100;
                let widthPct = (ref.offsetWidth / dimensions.width) * 100;
                // Circle and hex need a pixel-square rendered box or the
                // clipPath turns the shape into an ellipse / flattened hex.
                // Canvas is 16:9, so pixel-square == widthPct = heightPct × 9/16.
                // Same rule handleUpdateShape uses on shape change — apply
                // again on every resize so the streamer can't drift the slot
                // out of ratio.
                if (el.shape === 'circle' || el.shape === 'hex') {
                  widthPct = Math.round(heightPct * 9 / 16 * 100) / 100;
                }
                updateLayer(el.id, {
                  width: widthPct,
                  height: heightPct,
                  pos_x: (pos.x / dimensions.width) * 100,
                  pos_y: (pos.y / dimensions.height) * 100,
                });
              }}
              disableDragging={el.is_background}
              enableResizing={!el.is_background}
              bounds="parent"
              style={{ zIndex: el.is_background ? 0 : (isSelected ? 40 : 30) }}
            >
              <div
                style={{ position: 'relative', width: '100%', height: '100%' }}
                onClick={el.is_background ? (e) => { e.stopPropagation(); setSelectedSlotId(el.id); } : undefined}
              >
                <div
                  style={{
                    position: 'relative', width: '100%', height: '100%',
                    border: el.is_background
                      ? 'none'
                      : isSelected
                        ? '2px solid var(--casi-accent)'
                        : isActive
                          ? '2px solid var(--casi-accent2)'
                          : '1.5px solid rgba(var(--casi-accent-rgb),0.3)',
                    borderRadius: el.is_background ? 0 : el.shape === 'rounded' ? 14 : 6,
                    opacity: el.locked ? 0.7 : 1,
                    // Persistent soft glow on live slots so the streamer sees
                    // at a glance which of their slots is airing content. The
                    // viewer overlay has a 3s one-shot on transition; here it
                    // holds steady while the beam is live.
                    boxShadow: isActive
                      ? '0 0 0 3px rgba(var(--casi-accent2-rgb), 0.2), 0 0 24px rgba(var(--casi-accent2-rgb), 0.35)'
                      : undefined,
                    clipPath:
                      el.shape === 'circle' ? 'circle(50%)'
                      : el.shape === 'hex' ? 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)'
                      : undefined,
                  }}
                >
                  {!el.image_url ? (
                    el.shape === 'banner' && !el.locked ? (
                      <div className="banner-preview">
                        <span className="banner-preview-track">▰ Banner · viewer messages scroll here · tip to try</span>
                      </div>
                    ) : (() => {
                      // Two-layer outline so the slot boundary survives a bright
                      // backdrop image: a thin dark stroke on the outside via
                      // box-shadow, then the accent dashed border. Without the
                      // dark stroke the dashed accent line vanishes against
                      // sky/sand/snow backdrops.
                      const accentRgb = el.locked
                        ? '248,113,113'
                        : el.is_background ? '153,69,255' : 'var(--casi-accent-rgb)';
                      const labelText = el.locked
                        ? 'No requests'
                        : el.is_background ? 'Backdrop' : el.shape === 'banner' ? 'Banner' : 'Beam';
                      const priceLabel = (() => {
                        if (el.locked) return null;
                        const p = formatSlotPrice(el);
                        return p.rail === 'free' ? null : p.label;
                      })();
                      return (
                        <div style={{
                          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          border: `2px dashed rgba(${accentRgb}, 0.85)`,
                          borderRadius: el.is_background ? 12 : 6,
                          background: el.locked ? 'rgba(248,113,113,0.05)' : el.is_background ? 'rgba(153,69,255,0.06)' : `rgba(${accentRgb}, 0.07)`,
                          // Outer dark stroke so the dashed accent line stays
                          // visible on bright backdrops (beach / sky / snow).
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
                        }}>
                          <div style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                            // Dark scrim chip behind the icon + name + price so
                            // they're always legible against any backdrop. Single
                            // chip rather than per-line text-shadow to keep the
                            // visual quieter.
                            padding: el.is_background ? '10px 16px' : '6px 12px',
                            borderRadius: 6,
                            background: 'rgba(0,0,0,0.55)',
                            backdropFilter: 'blur(4px)',
                            WebkitBackdropFilter: 'blur(4px)',
                            border: `1px solid rgba(${accentRgb}, 0.35)`,
                            maxWidth: '90%',
                          }}>
                            {el.locked ? (
                              <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: 'rgba(248,113,113,0.85)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>🔒 Locked</span>
                            ) : null}
                            <span style={{ fontSize: el.is_background ? 22 : 16, marginBottom: 2, opacity: 0.95 }}>
                              {el.is_background ? '🖼️' : el.shape === 'banner' ? '▰' : '✦'}
                            </span>
                            <span style={{
                              fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5,
                              color: el.locked
                                ? '#fda4a4'
                                : el.is_background ? '#d2b8ff' : 'var(--casi-accent)',
                            }}>
                              {labelText}
                            </span>
                            {priceLabel && (
                              <span style={{
                                fontFamily: 'var(--font-casi-mono),monospace', fontSize: 11, fontWeight: 700, marginTop: 4,
                                color: el.is_background ? '#d2b8ff' : 'var(--casi-accent)',
                              }}>{priceLabel}</span>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    // 'cover' for shaped slots (circle, hex) so the image fills
                    // the shape — 'contain' would letterbox a portrait photo
                    // inside a circle and leave dead space. Backdrops and
                    // rect/rounded keep their previous behavior.
                    <SlotMedia
                      src={el.image_url}
                      fileType={null}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: (el.is_background || isSquareShape) ? 'cover' : 'contain',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
                {isSelected && !el.is_background ? (
                  <div style={{
                    position: 'absolute', top: -2, left: -2, right: -2, bottom: -2,
                    border: '2px solid var(--casi-accent)', borderRadius: 8, pointerEvents: 'none',
                    boxShadow: '0 0 0 3px rgba(var(--casi-accent-rgb),0.15)',
                  }} />
                ) : null}
                {/* Corner delete — only surfaces when the slot is idle.
                    Slots with an active beam or a queued booking hide this
                    entirely so the streamer uses End Early from Dashboard
                    (which settles the escrow first). deleteLayer itself
                    also guards, so even if the button leaks out, the
                    click is refused with a toast. */}
                {!el.is_background && !state ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); deleteLayer(el.id); }}
                    title="Delete slot"
                    style={{
                      position: 'absolute', top: 0, right: 0, width: 28, height: 28,
                      background: 'rgba(239, 68, 68, 0.85)', border: 'none',
                      borderRadius: '0 6px 0 6px', color: '#fff',
                      fontSize: 13, cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', zIndex: 50,
                    }}
                  >
                    ✕
                  </button>
                ) : null}
                {!el.is_background && state === 'active' ? (
                  <span
                    aria-hidden
                    className="font-mono uppercase inline-flex items-center gap-1.5"
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      padding: '3px 8px', borderRadius: 4,
                      background: 'rgba(var(--casi-accent2-rgb), 0.15)',
                      border: '1px solid rgba(var(--casi-accent2-rgb), 0.45)',
                      color: 'var(--casi-accent2)',
                      fontSize: 9, letterSpacing: '0.14em', zIndex: 50,
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: 'var(--casi-accent2)',
                        boxShadow: '0 0 6px rgba(var(--casi-accent2-rgb), 0.8)',
                      }}
                    />
                    Live · end from Dashboard
                  </span>
                ) : null}
                {!el.is_background && state === 'queued' ? (
                  <span
                    aria-hidden
                    className="font-mono uppercase"
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      padding: '3px 8px', borderRadius: 4,
                      background: 'rgba(var(--casi-accent-rgb), 0.12)',
                      border: '1px solid rgba(var(--casi-accent-rgb), 0.3)',
                      color: 'var(--casi-accent)',
                      fontSize: 9, letterSpacing: '0.14em', zIndex: 50,
                      pointerEvents: 'none',
                    }}
                  >
                    Queued
                  </span>
                ) : null}
              </div>
            </Rnd>
          );
        })}
      </div>

      {/* v9 editor footer — helper text only. Keyboard shortcut row was
          removed; streamers use the +Beam button, drag, and the click-X
          delete affordance, not keyboard chords. */}
      <div className="casi-v9-le-foot">
        <span className="casi-v9-le-save" style={{ textTransform: 'none', letterSpacing: '0.04em' }}>
          {elements.length === 0
            ? 'No slots yet — hit + Beam above to let viewers tip for a slot'
            : selectedEl && selectedEl.is_background
            ? 'Backdrop selected · change shape to convert back to a beam'
            : selectedEl
            ? 'Drag · resize from corners · snap to grid'
            : 'Tap a beam to select · drag to move'}
        </span>
      </div>
      </div>

      {/* v9 Properties column — wraps the existing BeamCtrlPanel */}
      <div className="casi-v9-cp-wrap">
        {selectedEl ? (
          <>
            <div className="casi-v9-cp-head">
              {selectedEl.is_background
                ? 'Backdrop'
                : `${(selectedEl.shape || 'beam').charAt(0).toUpperCase() + (selectedEl.shape || 'beam').slice(1)} slot`}
            </div>
            <BeamCtrlPanel
              el={selectedEl}
              activeBooking={null}
              updateSlider={updateSlider}
              updateLayer={updateLayer}
              toggleLock={toggleLock}
              deleteLayer={deleteLayer}
              kickBeam={() => showToast('Use Dashboard to end a running beam', 'err')}
              onDone={() => setSelectedSlotId(null)}
              onUpdateShape={handleUpdateShape}
              onUpdateGlow={handleUpdateGlow}
              stripeCurrency={stripeCurrency}
            />
          </>
        ) : (
          <div
            style={{
              padding: '32px 12px',
              textAlign: 'center',
              fontFamily: 'var(--M)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--text-4)',
            }}
          >
            Select a slot
          </div>
        )}
      </div>

      </div>{/* /casi-v9-le-grid3 */}
    </>
  );
}
