'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Rnd } from 'react-rnd';
import { createClient } from '@/utils/supabase/client';
import CasiLogo from '@/components/CasiLogo';
import SlotMedia from '@/components/SlotMedia';
import BeamCtrlPanel from '../../admin/_components/BeamCtrlPanel';

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

export default function StudioSetupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<any>(null);
  const [elements, setElements] = useState<any[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [saveStatus, setSaveStatus] = useState('Ready');
  const [isReady, setIsReady] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  // Drag threshold refs — distinguish "tap to select" from "drag to move"
  // so a single click on a slot selects it without also persisting a
  // near-zero position delta to the DB.
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const sliderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedEl = elements.find((el) => el.id === selectedSlotId) ?? null;

  const showToast = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  };

  // Auth gate + initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      const { data: els } = await supabase.from('overlay_elements').select('*').eq('profile_id', user.id);
      if (cancelled) return;
      setProfile(prof);
      setElements(els || []);
      setIsReady(true);
    })();
    return () => { cancelled = true; };
  }, [router, supabase]);

  // Realtime sync — admin's janitor / queue-advance / parallel admin tabs
  // can mutate overlay_elements out from under us. Subscribe to all events
  // (INSERT/UPDATE/DELETE) so the setup canvas stays in sync without a refresh.
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`studio_setup_elements_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overlay_elements', filter: `profile_id=eq.${profile.id}` }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          setElements((prev) => prev.some((e) => e.id === payload.new.id) ? prev : [...prev, payload.new]);
        } else if (payload.eventType === 'UPDATE') {
          setElements((prev) => prev.map((e) => (e.id === payload.new.id ? { ...e, ...payload.new } : e)));
        } else if (payload.eventType === 'DELETE') {
          setElements((prev) => prev.filter((e) => e.id !== payload.old.id));
          setSelectedSlotId((curr) => (curr === payload.old.id ? null : curr));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, supabase]);

  // ResizeObserver-backed callback ref — same pattern as admin so the
  // canvas gets its dimensions on first mount AND after viewport resizes.
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

  // Shape-change autosnap. Keeps the admin semantics identical: circle/hex
  // snap to a 9:16 pixel-square based on current height; banner snaps to a
  // full-width strip at the bottom; backdrop snaps to full-canvas and
  // demotes any prior backdrop so at most one is_background row exists.
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

  const addBeam = async () => {
    if (!profile?.id) return;
    const freePos = findFreePosition(elements);
    const { data } = await supabase.from('overlay_elements').insert({
      profile_id: profile.id, image_url: '',
      pos_x: freePos.pos_x, pos_y: freePos.pos_y,
      width: 20, height: 20,
      is_background: false, price_value: 0, price_unit: 'min', max_duration_minutes: null, locked: false,
    }).select().single();
    if (data) {
      setElements((prev) => [...prev, data]);
      setSelectedSlotId(data.id);
    }
  };

  // Delete guards against dropping a slot that still has live or queued
  // bookings attached. Admin does the same — without this, removing a row
  // leaves USDC locked in the on-chain escrow and orphans FK-linked
  // bookings.approved_queued rows that point at a now-missing element_id.
  const deleteLayer = async (id: string) => {
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
    if (selectedSlotId === id) setSelectedSlotId(null);
    await supabase.from('overlay_elements').delete().eq('id', id);
    setElements((prev) => prev.filter((el) => el.id !== id));
  };

  if (!isReady) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--casi-bg)', color: 'var(--casi-text-dim)' }}>
        <span style={{ fontFamily: 'var(--font-casi-mono), monospace', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Loading studio…</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--casi-bg)', color: 'var(--casi-text)' }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          padding: '12px 20px', borderRadius: 10,
          fontFamily: 'var(--font-casi-mono), monospace', fontSize: 11, letterSpacing: 1, maxWidth: 420,
          background: toast.kind === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${toast.kind === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: toast.kind === 'ok' ? '#4ade80' : '#f87171',
        }}>{toast.msg}</div>
      )}

      <nav className="flex items-center justify-between" style={{ padding: '18px 32px', borderBottom: '1px solid var(--casi-border)' }}>
        <Link href="/" className="flex items-center gap-2" style={{ color: 'var(--casi-text)', textDecoration: 'none' }}>
          <CasiLogo size={72} />
          <span className="font-extrabold" style={{ fontFamily: 'var(--font-casi-sans)', fontSize: 22, letterSpacing: '-1px' }}>casi</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="font-mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--casi-text-dim)' }}>{saveStatus}</span>
          <Link href="/studio" className="font-mono uppercase" style={{
            fontSize: 10, letterSpacing: '0.15em', textDecoration: 'none',
            color: 'var(--casi-text-dim)', padding: '5px 10px', borderRadius: 999, border: '1px solid var(--casi-border-2)',
          }}>← Live monitor</Link>
          <span className="font-mono uppercase" style={{
            padding: '6px 12px', borderRadius: 999,
            background: 'rgba(var(--casi-accent-rgb), 0.08)', border: '1px solid rgba(var(--casi-accent-rgb), 0.3)',
            color: 'var(--casi-accent)', fontSize: 11, letterSpacing: '0.14em',
          }}>Setup · beta</span>
        </div>
      </nav>

      <div className="mx-auto flex flex-col gap-5 casi-page-pad" style={{ maxWidth: 1080 }}>
        <header className="flex items-start justify-between gap-4" style={{ flexWrap: 'wrap' }}>
          <div>
            <h1 className="font-extrabold" style={{ fontSize: 28, letterSpacing: '-1px', color: 'var(--casi-text)' }}>Slots &amp; canvas</h1>
            <p className="mt-1" style={{ fontSize: 14, color: 'var(--casi-text-dim)' }}>
              Arrange where booked beams land. Drag to move, resize from corners, click to edit shape, price, and glow.{' '}
              Streamer-facing settings (profile, payouts, OBS keys, moderation) live in{' '}
              <Link href="/admin/settings" style={{ color: 'var(--casi-accent)', textDecoration: 'none' }}>Settings</Link>.
            </p>
          </div>
          <button onClick={addBeam} style={{
            background: 'var(--casi-accent)', color: 'var(--casi-bg)', border: 'none',
            borderRadius: 8, padding: '10px 18px',
            fontFamily: 'var(--font-casi-sans), sans-serif', fontWeight: 800, fontSize: 12,
            textTransform: 'uppercase', letterSpacing: '0.3px', cursor: 'pointer', flexShrink: 0,
          }}>+ Beam</button>
        </header>

        <div
          className="canvas-wrap"
          ref={setCanvasRef}
          onClick={(e) => {
            if ((e.target as HTMLElement).classList.contains('canvas-wrap')) {
              setSelectedSlotId(null);
            }
          }}
        >
          {dimensions.width > 0 && elements.map((el) => {
            const isSelected = selectedSlotId === el.id;
            return (
              <Rnd
                key={el.id}
                size={{
                  width: el.is_background ? '100%' : `${(el.width / 100) * dimensions.width}px`,
                  height: el.is_background ? '100%' : `${(el.height / 100) * dimensions.height}px`,
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
                  updateLayer(el.id, {
                    width: (ref.offsetWidth / dimensions.width) * 100,
                    height: (ref.offsetHeight / dimensions.height) * 100,
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
                      border: el.is_background ? 'none' : isSelected ? '2px solid var(--casi-accent)' : '1.5px solid rgba(var(--casi-accent-rgb),0.3)',
                      borderRadius: el.is_background ? 0 : el.shape === 'rounded' ? 14 : 6,
                      opacity: el.locked ? 0.7 : 1,
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
                      ) : (
                        <div style={{
                          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          border: `1.5px dashed ${el.locked ? 'rgba(248,113,113,0.3)' : el.is_background ? 'rgba(168,85,247,0.35)' : 'rgba(var(--casi-accent-rgb),0.35)'}`,
                          borderRadius: el.is_background ? 12 : 6,
                          background: el.locked ? 'rgba(248,113,113,0.04)' : el.is_background ? 'rgba(168,85,247,0.04)' : 'rgba(var(--casi-accent-rgb),0.04)',
                        }}>
                          {el.locked && <span style={{ fontFamily: 'var(--font-casi-mono),monospace', fontSize: 10, color: 'rgba(248,113,113,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>🔒 Locked</span>}
                          <span style={{ fontSize: el.is_background ? 24 : 16, marginBottom: 4 }}>
                            {el.is_background ? '🖼️' : el.shape === 'banner' ? '▰' : '✦'}
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-casi-mono),monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1,
                            color: el.locked ? 'rgba(248,113,113,0.5)' : el.is_background ? 'rgba(168,85,247,0.6)' : 'rgba(var(--casi-accent-rgb),0.6)',
                          }}>
                            {el.locked ? 'No requests' : el.is_background ? 'Backdrop' : el.shape === 'banner' ? 'Banner' : 'Beam'}
                          </span>
                          {el.price_value > 0 && !el.locked && (
                            <span style={{
                              fontFamily: 'var(--font-casi-mono),monospace', fontSize: 11, fontWeight: 500, marginTop: 3,
                              color: el.is_background ? 'rgba(168,85,247,0.9)' : 'var(--casi-accent)',
                            }}>${el.price_value}/{el.price_unit}</span>
                          )}
                        </div>
                      )
                    ) : (
                      <SlotMedia src={el.image_url} fileType={null} style={{ width: '100%', height: '100%', objectFit: el.is_background ? 'cover' : 'contain', pointerEvents: 'none' }} />
                    )}
                  </div>
                  {isSelected && !el.is_background && (
                    <div style={{
                      position: 'absolute', top: -2, left: -2, right: -2, bottom: -2,
                      border: '2px solid var(--casi-accent)', borderRadius: 8, pointerEvents: 'none',
                      boxShadow: '0 0 0 3px rgba(var(--casi-accent-rgb),0.15)',
                    }} />
                  )}
                </div>
              </Rnd>
            );
          })}
        </div>

        {selectedEl && (
          <BeamCtrlPanel
            el={selectedEl}
            activeBooking={null}
            updateSlider={updateSlider}
            updateLayer={updateLayer}
            toggleLock={toggleLock}
            deleteLayer={deleteLayer}
            kickBeam={() => showToast('Use Live monitor to end a running beam', 'err')}
            onDone={() => setSelectedSlotId(null)}
            onUpdateShape={handleUpdateShape}
            onUpdateGlow={handleUpdateGlow}
          />
        )}

        <div className="canvas-hint">
          {elements.length === 0
            ? 'No slots yet — hit + Beam above to let viewers tip to display an image or video here'
            : selectedEl && selectedEl.is_background
            ? 'Backdrop selected · change shape to convert back to a beam'
            : selectedEl
            ? 'Drag to move · Resize from corners · Edit inline'
            : 'Tap a beam to select · Drag to move · Resize from corners'}
        </div>
      </div>
    </main>
  );
}
