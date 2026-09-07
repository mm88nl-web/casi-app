'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Rnd } from 'react-rnd';
import SlotMedia from '@/components/SlotMedia';
import BeamCtrlPanel from './BeamCtrlPanel';
import StudioLayersPanel, { type LayerItem } from './StudioLayersPanel';
import { formatSlotPrice } from '@/lib/slot-pricing';

// Outage-workaround fallback — see src/app/api/overlay-direct/mutate/route.ts
// and src/lib/db-direct.ts. Only reached when the normal supabase-js write
// already failed (e.g. the Supabase egress-quota 402). Safe to delete this
// helper and its two call sites once that's resolved.
async function tryDirectMutate(
  supabase: SupabaseClient,
  body: { action: 'update'; id: string; updates: Record<string, unknown> }
    | { action: 'insert'; data: Record<string, unknown> }
): Promise<{ data: any } | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch('/api/overlay-direct/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null; // bypass also unavailable — caller falls back to its normal failure path
  }
}

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
  /** Stripe Connect's default currency for this streamer's account
   *  (lowercase ISO-4217 — usd/eur/gbp/jpy/brl/aud/...). Drives the
   *  Stripe currency row on the slot Pricing tab so the rate input is
   *  in whatever currency Stripe will actually charge in. null means
   *  Stripe isn't connected yet; the row is hidden and the streamer
   *  prices in USDC only. */
  stripeCurrency?: string | null;
  /** Called from the add-beam toolbar button (external header) so the parent
   *  can render the button in its own layout. Optional — if not provided,
   *  an internal button renders above the canvas. */
  onAddHandler?: (handler: () => void) => void;
  /** Pre-rendered approval-queue content (an <ApprovalQueue /> from the
   *  parent, which owns the real booking/flash data + moderation
   *  handlers) — rendered inside the sidebar's "Waiting" tab. StudioLiveEditor
   *  doesn't know anything about booking/flash shapes; it just hosts this. */
  queueSlot?: ReactNode;
  /** Badge count on the "Waiting" tab — the parent's pending queue length. */
  queueBadgeCount?: number;
  /** Pre-rendered content (AiringNow + FlashesLog from the parent) shown
   *  below the canvas, matching the design-source prototype's single-column
   *  flow of status bar → canvas → On air → Flashes. */
  belowCanvasSlot?: ReactNode;
  /** Publish-my-own-content — passed straight through to whichever beam's
   *  BeamCtrlPanel is selected (see StreamerPublishCard.tsx). The parent
   *  owns the actual publish call + storage upload; StudioLiveEditor just
   *  threads it to the selected slot's properties panel. */
  publishing?: boolean;
  onPublish?: (elementId: string, imageUrl: string, fileType: 'image' | 'video', storagePath: string | null) => void;
};

export default function StudioLiveEditor({
  supabase,
  profileId,
  stripeCurrency,
  onAddHandler,
  queueSlot,
  queueBadgeCount = 0,
  belowCanvasSlot,
  publishing,
  onPublish,
}: Props) {
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
  // Sidebar tab — matches the design-source prototype's Waiting/Layers
  // segmented switch (one shared column, not two separate always-visible
  // panels). Defaults to Waiting since that's the more time-sensitive of
  // the two and matches the prototype's initial screenshot state.
  const [rightTab, setRightTab] = useState<'waiting' | 'layers'>('waiting');

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
    let prevEl: any = null;
    setElements((prev) => prev.map((el) => {
      if (el.id !== id) return el;
      prevEl = el;
      return { ...el, ...s };
    }));
    const { error } = await supabase.from('overlay_elements').update(s).eq('id', id);
    if (error) {
      const bypassed = await tryDirectMutate(supabase, { action: 'update', id, updates: s });
      if (!bypassed) {
        // Roll back the optimistic update — nothing persisted, so the UI
        // shouldn't keep showing it as applied.
        if (prevEl) setElements((prev) => prev.map((el) => (el.id === id ? prevEl : el)));
        setSaveStatus('Ready');
        showToast('Save failed — change was not saved', 'err');
        return;
      }
    }
    setSaveStatus('Saved');
    setTimeout(() => setSaveStatus('Ready'), 2000);
  }, [supabase]);

  const updateSlider = useCallback((id: string, updates: any) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...updates } : el)));
    if (sliderSaveTimer.current) clearTimeout(sliderSaveTimer.current);
    sliderSaveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from('overlay_elements').update(updates).eq('id', id);
      if (error) showToast('Save failed — change was not saved', 'err');
    }, 400);
  }, [supabase]);

  // Shape-change autosnap — same semantics as admin/page.tsx:
  //  - circle/custom → 9:16 pixel-square based on current height
  //  - banner → full-width bottom strip
  //  - backdrop → full-canvas, demotes prior backdrop so at most one is_background row exists
  const handleUpdateShape = useCallback(async (id: string, shape: string, extra?: { corner_radius?: number; clip_path_svg?: string | null }) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const patch: Record<string, unknown> = { shape, ...(extra ?? {}) };
    if (shape === 'circle' || shape === 'custom') {
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

  const addBeam = useCallback(async () => {
    const freePos = findFreePosition(elements);
    const insertData = {
      profile_id: profileId, image_url: '',
      pos_x: freePos.pos_x, pos_y: freePos.pos_y,
      width: 20, height: 20,
      is_background: false, price_value: 0, price_unit: 'min', max_duration_minutes: null, locked: false,
    };
    const { data, error } = await supabase.from('overlay_elements').insert(insertData).select().single();
    if (data) {
      setElements((prev) => [...prev, data]);
      setSelectedSlotId(data.id);
    } else if (error) {
      const bypassed = await tryDirectMutate(supabase, { action: 'insert', data: insertData });
      if (bypassed?.data) {
        setElements((prev) => [...prev, bypassed.data]);
        setSelectedSlotId(bypassed.data.id);
      } else {
        showToast('Could not add beam — save failed', 'err');
      }
    }
  }, [supabase, profileId, elements]);

  // Mirrors addBeam, but inserts full-canvas and background from the start —
  // and demotes any existing backdrop first, same invariant handleUpdateShape
  // enforces when converting a slot to 'backdrop' (at most one is_background
  // row). Without the demotion a streamer clicking "+ Backdrop" twice would
  // end up with two full-canvas background layers stacked on top of each
  // other with no way to tell them apart on the canvas.
  const addBackdrop = useCallback(async () => {
    const prior = elements.find((e) => e.is_background);
    if (prior) await updateLayer(prior.id, { is_background: false, shape: 'rect' });
    const insertData = {
      profile_id: profileId, image_url: '',
      pos_x: 0, pos_y: 0, width: 100, height: 100,
      is_background: true, shape: 'backdrop',
      price_value: 0, price_unit: 'min', max_duration_minutes: null, locked: false,
    };
    const { data, error } = await supabase.from('overlay_elements').insert(insertData).select().single();
    if (data) {
      setElements((prev) => [...prev, data]);
      setSelectedSlotId(data.id);
    } else if (error) {
      const bypassed = await tryDirectMutate(supabase, { action: 'insert', data: insertData });
      if (bypassed?.data) {
        setElements((prev) => [...prev, bypassed.data]);
        setSelectedSlotId(bypassed.data.id);
      } else {
        showToast('Could not add backdrop — save failed', 'err');
      }
    }
  }, [supabase, profileId, elements, updateLayer]);

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
  //
  // Labels are sequential ("Beam 1", "Beam 2", …) rather than shape-derived
  // ("Rect", "Circle") — matches the design-source prototype and gives a
  // streamer with multiple slots of the same shape a way to tell them apart
  // at a glance. Purely a display label recomputed from z-order on every
  // render — not persisted, so it's safe to shift when a slot is added,
  // reordered, or deleted. The shape glyph in the row (LayerIcon) still
  // reflects the real shape independently of this label.
  const layers: LayerItem[] = useMemo(() => {
    let beamNumber = 0;
    const items = elements.map((el) => {
      const live = slotState[el.id] === 'active';
      const queued = slotState[el.id] === 'queued';
      const status = live ? 'LIVE' : queued ? 'queued' : 'idle';
      // Pick the right rail to display from el.prices JSONB — the legacy
      // price_value column mirrors only the USD rate, which mis-labels
      // USDC-only and EUR-only slots as "$0/min" or hides them. The
      // helper falls back to price_value for slots predating the JSONB.
      const price = formatSlotPrice(el).label;
      const label = el.is_background ? 'Backdrop' : `Beam ${++beamNumber}`;
      return {
        id: el.id,
        shape: (el.shape as LayerItem['shape']) ?? 'rect',
        label,
        meta: `${price} · ${status}`,
        isLive: live,
        isLocked: !!el.locked,
        isBackground: !!el.is_background,
      };
    });
    // Backdrop always sorts to the bottom of the list — it sits conceptually
    // "under" every beam, and there's at most one, so it shouldn't compete
    // for top billing just because of when it happened to be created. Beam
    // numbering above is computed BEFORE this sort so it still reflects
    // creation order, not this display order.
    return items.sort((a, b) => (a.isBackground === b.isBackground ? 0 : a.isBackground ? 1 : -1));
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
  //
  // The copy-paste UI for these URLs lives in /studio/settings → OBS
  // sources. Rendering them inline in the live editor was redundant
  // chrome that ate vertical space on every visit; the welcome banner
  // points first-time streamers at the settings page directly.

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

      {/* v9 toolbar — save status only. Edit/Preview toggle was removed —
          the editor is always in edit mode (grid + dashed outlines + delete
          handles). Streamers preview the live result via the OBS source URL
          shown above, not via a fake in-app preview. Adding slots lives
          entirely in the Layers panel's "+ Add" (Beam / Backdrop) menu below
          — this toolbar used to duplicate that with its own +Beam button;
          onAddHandler is never passed by the one real caller (studio/
          page.tsx), so this row always renders alongside the Layers panel,
          and two separate add affordances on screen was never intentional. */}
      {!onAddHandler ? (
        <div className="casi-v9-le-toolbar">
          <span className="casi-v9-le-save">{saveStatus} · auto-saved</span>
        </div>
      ) : null}

      {/* v9 2-col layout — Canvas (+ On air/Flashes below) · Waiting/Layers
          sidebar. Matches the design-source prototype's single-screen
          studio: canvas and its status feed on the left, a tabbed
          Waiting/Layers panel on the right (not three simultaneous
          columns — Layers and Properties share one column, and the
          approval queue lives in the same slot as an alternate tab). */}
      <div className="casi-v9-le-grid2">

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
        {/* SVG clipPath defs for custom-shaped slots */}
        {elements.some(el => el.shape === 'custom' && el.clip_path_svg) && (
          <svg width="0" height="0" style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              {elements.filter(el => el.shape === 'custom' && el.clip_path_svg).map(el => (
                <clipPath key={el.id} id={`studio-clip-${el.id}`} clipPathUnits="objectBoundingBox">
                  <path d={el.clip_path_svg} />
                </clipPath>
              ))}
            </defs>
          </svg>
        )}
        {dimensions.width > 0 && elements.map((el) => {
          const isSelected = selectedSlotId === el.id;
          const state = slotState[el.id]; // 'active' | 'queued' | undefined
          const isActive = state === 'active';
          // Circle and custom shapes need a pixel-square box or the clip-path
          // collapses to an oval / distorted shape. The autosnap on shape
          // change + onResizeStop keep stored dims in ratio, but legacy
          // rows or partial saves can drift — clamp here so the rendered
          // box is always square regardless of what's in the DB.
          const isSquareShape = el.shape === 'circle' || el.shape === 'custom';
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
                // Circle and custom shapes need a pixel-square rendered box or
                // the clipPath turns the shape into an ellipse / distorted form.
                // Canvas is 16:9, so pixel-square == widthPct = heightPct × 9/16.
                // Same rule handleUpdateShape uses on shape change — apply
                // again on every resize so the streamer can't drift the slot
                // out of ratio.
                if (el.shape === 'circle' || el.shape === 'custom') {
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
                {/* Bare clip wrapper carrying ONLY clip-path — border/
                    borderRadius/overflow/boxShadow all live on the nested
                    child below instead. A custom (concave) heart/star path
                    combined with those other box-model properties on the
                    SAME element rendered with the top portion truncated to
                    a plain rectangle (bottom point + sides came out
                    correctly heart-shaped, but the top lobes were cut off
                    flat) — this exact "clip-path plus other styling on one
                    element" combination was already root-caused as
                    unreliable once before, in the viewer-facing overlay's
                    empty-slot placeholder (see overlay/page.tsx). Same fix
                    here: match the structural shape that's proven to work. */}
                <div
                  style={{
                    position: 'relative', width: '100%', height: '100%',
                    clipPath:
                      el.shape === 'circle' ? 'circle(50%)'
                      : el.shape === 'custom' && el.clip_path_svg ? `url(#studio-clip-${el.id})`
                      : undefined,
                  }}
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
                    borderRadius: el.is_background ? 0 : (el.shape === 'circle' || el.shape === 'custom') ? 0 : Math.max(6, el.corner_radius ?? 0),
                    overflow: 'hidden',
                    opacity: el.locked ? 0.7 : 1,
                    // Persistent soft glow on live slots so the streamer sees
                    // at a glance which of their slots is airing content. The
                    // viewer overlay has a 3s one-shot on transition; here it
                    // holds steady while the beam is live.
                    boxShadow: isActive
                      ? '0 0 0 3px rgba(var(--casi-accent2-rgb), 0.2), 0 0 24px rgba(var(--casi-accent2-rgb), 0.35)'
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
                          border: `2px dashed rgba(${accentRgb}, 0.9)`,
                          borderRadius: el.is_background ? 12 : 6,
                          background: el.locked ? 'rgba(248,113,113,0.08)' : el.is_background ? 'rgba(153,69,255,0.1)' : `rgba(${accentRgb}, 0.1)`,
                          // Soft glow so the slot reads as a distinct region on
                          // the dark canvas regardless of skin color.
                          boxShadow: el.locked
                            ? '0 0 0 1px rgba(0,0,0,0.6), 0 0 10px rgba(248,113,113,0.15)'
                            : `0 0 0 1px rgba(0,0,0,0.6), 0 0 10px rgba(${accentRgb}, 0.18)`,
                        }}>
                          <div style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                            padding: el.is_background ? '10px 16px' : '6px 12px',
                            borderRadius: 6,
                            background: 'rgba(0,0,0,0.72)',
                            backdropFilter: 'blur(6px)',
                            WebkitBackdropFilter: 'blur(6px)',
                            border: `1px solid rgba(${accentRgb}, 0.6)`,
                            maxWidth: '90%',
                          }}>
                            {el.locked ? (
                              <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: 'rgba(248,113,113,0.85)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Locked</span>
                            ) : null}
                            <span style={{ fontSize: el.is_background ? 22 : 16, marginBottom: 2, opacity: 0.95 }}>
                              {el.is_background ? '▢' : el.shape === 'banner' ? '▰' : '✦'}
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

      {belowCanvasSlot}
      </div>

      {/* Sidebar — Waiting (approval queue) / Layers (list + inline
          properties), one shared column matching the prototype. */}
      <div className="casi-v9-le-side">
        <div className="casi-v9-side-tabs">
          <button
            type="button"
            onClick={() => setRightTab('waiting')}
            className={`casi-v9-side-tab${rightTab === 'waiting' ? ' casi-v9-on' : ''}`}
          >
            Waiting
            {queueBadgeCount > 0 ? <span className="casi-v9-side-tab-badge">{queueBadgeCount}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => setRightTab('layers')}
            className={`casi-v9-side-tab${rightTab === 'layers' ? ' casi-v9-on' : ''}`}
          >
            Layers
            <span className="casi-v9-side-tab-badge">{layers.length}</span>
          </button>
        </div>

        {rightTab === 'waiting' ? (
          queueSlot ?? null
        ) : (
          <>
            <StudioLayersPanel
              layers={layers}
              selectedId={selectedSlotId}
              onSelect={(id) => setSelectedSlotId(id)}
              onAdd={addBeam}
              onAddBackdrop={addBackdrop}
              onToggleLock={setLayerLocked}
            />

            {/* Properties — wraps the existing BeamCtrlPanel, expanding
                inline below the layers list (not a separate 3rd column)
                when a slot is selected, matching the prototype exactly. */}
            {selectedEl ? (
              <div className="casi-v9-cp-wrap">
                {/* Identity header — label matches the Layers list row
                    exactly (see the `layers` memo above) so a streamer
                    never loses track of which slot they clicked, plus an
                    inline delete link matching the design-source
                    prototype's header pattern (a single delete affordance
                    instead of also repeating one at the bottom of the
                    panel). */}
                <div className="casi-v9-cp-head-row">
                  <div>
                    <div className="casi-v9-cp-head">
                      {layers.find((l) => l.id === selectedEl.id)?.label ?? 'Beam'}
                    </div>
                    <div className="casi-v9-cp-head-sub">
                      {selectedEl.is_background ? 'full-bleed backdrop' : `${selectedEl.shape || 'rect'} slot`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="casi-v9-cp-head-del"
                    onClick={() => deleteLayer(selectedEl.id)}
                  >
                    delete
                  </button>
                </div>
                <BeamCtrlPanel
                  el={selectedEl}
                  activeBooking={null}
                  updateSlider={updateSlider}
                  updateLayer={updateLayer}
                  kickBeam={() => showToast('Use Dashboard to end a running beam', 'err')}
                  onDone={() => setSelectedSlotId(null)}
                  onUpdateShape={handleUpdateShape}
                  stripeCurrency={stripeCurrency}
                  publishing={publishing}
                  onPublish={onPublish}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      </div>{/* /casi-v9-le-grid2 */}
    </>
  );
}
