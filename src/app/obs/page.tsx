"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import SlotMedia from '@/components/SlotMedia';
import SkinProvider from '@/components/SkinProvider';

function OBSContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('s') || 'first';
  const layer = searchParams.get('layer') || 'beams'; // 'beams' | 'backdrop' | unset = all

  const [elements, setElements] = useState<any[]>([]);
  // Loaded alongside elements so we can render banner marquees (which pull
  // their content from booking.message, not overlay_elements.image_url).
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  // Streamer's skin — passed to <SkinProvider> below, which writes
  // --ink / --casi-accent-rgb / --casi-accent2 / --casi-accent2-rgb onto
  // <html>. glow + banner below read those CSS vars directly instead of
  // interpolating colour into the <style> template, so they match the
  // streamer's brand (and stay live if the skin changes) the same way
  // /overlay and /s/[username] already do.
  const [profileSkin, setProfileSkin] = useState<{
    skin: string | null; inkColor: string | null; paperColor: string | null; accent2Color: string | null;
  }>({ skin: null, inkColor: null, paperColor: null, accent2Color: null });
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const load = async () => {
      let prof: any = null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, skin, theme_color, ink_color, paper_color, accent2_color')
        .eq('username', username)
        .single();
      prof = data;
      if (error || !prof) {
        // Supabase REST is down (e.g. quota-outage 402) — fall back to the
        // direct-Postgres bypass route. See src/lib/db-direct.ts. Safe to
        // remove this whole branch once the outage is resolved.
        try {
          const res = await fetch(`/api/overlay-direct/obs-data?username=${encodeURIComponent(username)}`);
          if (res.ok) prof = (await res.json()).profile;
        } catch { /* bypass also unavailable — nothing more to try */ }
      }
      if (prof) {
        setProfileId(prof.id);
        setProfileSkin({
          skin: prof.skin ?? null,
          inkColor: prof.skin === 'custom' ? (prof.ink_color ?? prof.theme_color ?? null) : null,
          paperColor: prof.skin === 'custom' ? (prof.paper_color ?? null) : null,
          accent2Color: prof.skin === 'custom' ? (prof.accent2_color ?? null) : null,
        });
      }
    };
    load();
  }, [username, supabase]);

  useEffect(() => {
    if (!profileId) return;

    const loadAll = async () => {
      const [elRes, bkRes] = await Promise.all([
        supabase.from('overlay_elements').select('*').eq('profile_id', profileId),
        supabase
          .from('bookings')
          .select('id, element_id, message, status, banner_font_px, banner_speed_secs, media_offset_x, media_offset_y, media_zoom')
          .eq('profile_id', profileId)
          .eq('status', 'active'),
      ]);

      let els = elRes.data;
      let bks = bkRes.data;
      if (elRes.error || bkRes.error) {
        // Same outage bypass as the profile-lookup effect above — one call
        // covers both tables since the route already joins them server-side.
        try {
          const res = await fetch(`/api/overlay-direct/obs-data?username=${encodeURIComponent(username)}`);
          if (res.ok) {
            const json = await res.json();
            els = json.elements;
            bks = json.bookings;
          }
        } catch { /* bypass also unavailable — render whatever we already have */ }
      }

      let filteredEls = els || [];
      if (layer === 'beams')         filteredEls = filteredEls.filter(el => !el.is_background);
      else if (layer === 'backdrop') filteredEls = filteredEls.filter(el => el.is_background);
      // Unlike the old implementation we don't pre-filter on image_url
      // here — banner slots have no image_url, they render from a
      // booking.message marquee instead. The render loop decides per-row.

      setElements(filteredEls);
      setActiveBookings(bks || []);
    };

    loadAll();

    // CORRECTED 2026-09-07: the previous version of this watchdog tracked
    // only a "last event" timestamp and refetched whenever >15s had passed
    // since the last bump — but a genuinely healthy realtime connection
    // goes quiet for long stretches whenever nothing in bookings/
    // overlay_elements actually changes (the common case for most of a
    // 24/7 stream's runtime), and that quiet was indistinguishable from a
    // dead connection. Verified live via Supabase's edge logs: this OBS
    // window was steadily making ~6 requests/minute around the clock —
    // the "backstop" had become the PRIMARY polling mechanism, not a rare
    // fallback, quietly eating into the free-tier egress quota 24/7 (see
    // the exceed_egress_quota errors logged by the solana-reconciler cron
    // in this same window).
    //
    // Fixed by reacting to the channel's own reported status instead of
    // guessing from a quiet timer: SUBSCRIBED means healthy (no refetch
    // needed beyond the one-time catch-up), CLOSED/CHANNEL_ERROR/TIMED_OUT
    // means the socket actually dropped (Supabase's client auto-retries
    // the underlying reconnect; this just makes sure we catch up on
    // whatever changed while it was down). SAFETY_NET_MS is a much longer,
    // pure last-resort in case a status callback is ever missed entirely —
    // not the everyday path.
    let elHealthy = false, bkHealthy = false;
    let lastRefetchAt = Date.now();
    const refetchOnce = () => { lastRefetchAt = Date.now(); loadAll(); };

    const elCh = supabase.channel(`obs_els_${layer}_${profileId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'overlay_elements',
        filter: `profile_id=eq.${profileId}`,
      }, refetchOnce)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { elHealthy = true; refetchOnce(); }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          elHealthy = false; refetchOnce();
        }
      });

    // Banner content lives on bookings (message field), so the OBS render
    // needs to hear about booking transitions too — not just element
    // edits. Without this subscription, a banner approved by the streamer
    // wouldn't appear until the streamer also touched the slot.
    const bkCh = supabase.channel(`obs_bks_${layer}_${profileId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `profile_id=eq.${profileId}`,
      }, refetchOnce)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { bkHealthy = true; refetchOnce(); }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          bkHealthy = false; refetchOnce();
        }
      });

    // Last-resort safety net only — fires solely when BOTH channels have
    // never reported a healthy status at all (e.g. a status callback got
    // dropped somewhere) AND it's been a genuinely long time. A connection
    // that's ever reached SUBSCRIBED relies on its own CLOSED/ERROR
    // callback above, not this timer, to catch future drops.
    const SAFETY_NET_MS = 90_000;
    const watchdog = setInterval(() => {
      if (!elHealthy && !bkHealthy && Date.now() - lastRefetchAt > SAFETY_NET_MS) {
        refetchOnce();
      }
    }, 10_000);

    return () => {
      supabase.removeChannel(elCh);
      supabase.removeChannel(bkCh);
      clearInterval(watchdog);
    };
  }, [profileId, layer, supabase]);

  const getActive = (elId: string) => activeBookings.find(b => b.element_id === elId) || null;

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden skin-root">
      <SkinProvider
        skin={profileSkin.skin}
        inkColor={profileSkin.inkColor}
        paperColor={profileSkin.paperColor}
        accent2Color={profileSkin.accent2Color}
      />
      <style>{`
        /* Force the page transparent so OBS composites the beams over the
           streamer's video. globals.css paints the cream --paper on <html>
           (added in #148 to kill the mobile dark-flash); without this override
           that cream leaks into the browser source as a solid rectangle. */
        html, body { background: transparent !important; }
        /* Shape mask + one-shot glow + banner marquee. Colours read live off
           the skin tokens SkinProvider writes onto <html> (--ink for brand/
           label chrome, --casi-accent2-rgb for the "just went live" glow —
           state, not brand, per the skin token contract) instead of being
           baked into this template string, so they match the streamer's
           brand and stay in sync if the skin changes underneath. */
        @keyframes beamGlow    { 0%{box-shadow:0 0 0 rgba(var(--casi-accent2-rgb),0)} 15%{box-shadow:0 0 42px 8px rgba(var(--casi-accent2-rgb),0.85)} 100%{box-shadow:0 0 0 rgba(var(--casi-accent2-rgb),0)} }
        @keyframes beamMarquee { from{transform:translateX(100%)} to{transform:translateX(-100%)} }
        .obs-shape-circle  { clip-path: circle(50%); }
        .obs-glow          { animation: beamGlow 3s ease-out 1; will-change: box-shadow; }
        .obs-banner        { display:flex; align-items:center; width:100%; height:100%; overflow:hidden; background:rgba(0,0,0,0.78); border-top:2px solid rgba(var(--casi-accent-rgb),0.4); border-bottom:2px solid rgba(var(--casi-accent-rgb),0.4); white-space:nowrap; }
        .obs-banner-track  { display:inline-block; padding-left:100%; color:var(--ink); font-family:var(--font-casi-sans),sans-serif; font-weight:800; font-size:28px; letter-spacing:1px; animation: beamMarquee 20s linear infinite; }
      `}</style>
      <div className="relative w-full h-full">
        {/* SVG clipPath defs for custom shapes */}
        {elements.some(el => el.shape === 'custom' && el.clip_path_svg) && (
          <svg width="0" height="0" style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              {elements.filter(el => el.shape === 'custom' && el.clip_path_svg).map(el => (
                <clipPath key={el.id} id={`obs-clip-${el.id}`} clipPathUnits="objectBoundingBox">
                  <path d={el.clip_path_svg} />
                </clipPath>
              ))}
            </defs>
          </svg>
        )}
        {elements.map((el) => {
          const active = getActive(el.id);
          const isBannerActive = el.shape === 'banner' && !!active?.message;
          const shapeClass = el.shape === 'circle' ? 'obs-shape-circle' : '';
          const cornerR = (el.shape === 'rect' || el.shape === 'rounded') ? (el.shape === 'rounded' ? 14 : (el.corner_radius ?? 0)) : 0;
          const customClip = el.shape === 'custom' && el.clip_path_svg ? { clipPath: `url(#obs-clip-${el.id})` } : {};
          const glowClass = !!active && (el.glow_on_start ?? true) && !el.is_background ? 'obs-glow' : '';
          // Keyed on the active booking so each fresh beam re-mounts and
          // the glow animation plays from zero. Matches /overlay behaviour.
          const mediaKey = `${el.id}-${active?.id ?? 'none'}`;

          // Banner: render the viewer's message as a marquee instead of
          // their uploaded image (they may not have uploaded one at all).
          if (isBannerActive) {
            const bFont  = Number(active?.banner_font_px    ?? 28);
            const bSpeed = Number(active?.banner_speed_secs ?? 20);
            return (
              <div key={el.id} style={{
                position: 'absolute',
                left: `${el.pos_x}%`, top: `${el.pos_y}%`,
                width: `${el.width}%`, height: `${el.height}%`,
                zIndex: 50,
                transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
              }}>
                <div key={mediaKey} className={`obs-banner ${glowClass}`.trim()}>
                  <span
                    className="obs-banner-track"
                    style={{ fontSize: bFont, animationDuration: `${bSpeed}s` }}
                  >{active.message}</span>
                </div>
              </div>
            );
          }

          // Image/video slot — skip rows that have no media set yet; they
          // haven't had an active beam on them. (Banner rows handled above.)
          if (!el.image_url) return null;

          const offX = Number(active?.media_offset_x ?? 50);
          const offY = Number(active?.media_offset_y ?? 50);
          const zoom = Number(active?.media_zoom     ?? 1);
          // Must match overlay/page.tsx's objectFitCss exactly (cover once
          // zoom > 1, not on pan alone) — otherwise a beam whose viewer only
          // panned at 1x renders identically in the booking preview/overlay
          // (pan has no visible effect at scale 1) but jumps to a completely
          // different cover-cropped frame here on the actual broadcast.
          const useCover = el.is_background || el.shape === 'circle' || el.shape === 'custom' || zoom > 1;

          return (
            <div key={el.id} style={{
              position: 'absolute',
              left: `${el.pos_x}%`, top: `${el.pos_y}%`,
              width: `${el.width}%`, height: `${el.height}%`,
              zIndex: el.is_background ? 10 : 50,
              transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
              willChange: 'transform',
              overflow: 'hidden',
              borderRadius: cornerR > 0 ? `${cornerR}px` : undefined,
            }}>
              <div
                key={mediaKey}
                className={`${shapeClass} ${glowClass}`.trim()}
                style={{ width: '100%', height: '100%', ...customClip }}
              >
                <SlotMedia
                  src={el.image_url}
                  fileType={null}
                  style={{
                    width: '100%',
                    height: '100%',
                    // Backdrop / circle / hex / custom-cropped: cover so
                    // the mask fills (edges crop, not stretch). Plain
                    // rect/rounded preserves aspect ratio with contain.
                    objectFit: useCover ? 'cover' : 'contain',
                    // Pan is encoded as transform-origin, NOT objectPosition —
                    // combining objectPosition with scale() double-offsets the
                    // pan (see overlay/page.tsx). Keep this block identical to
                    // overlay/page.tsx and CustomizePanel.tsx's preview or the
                    // live broadcast drifts from what the viewer cropped.
                    transformOrigin: `${offX}% ${offY}%`,
                    transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                    pointerEvents: 'none',
                    filter: el.is_background ? undefined : 'drop-shadow(0 10px 30px rgba(0,0,0,0.5))',
                  }}
                />
              </div>
            </div>
          );
        })}

        {/* The "get on stream · casi.gg" growth tag that used to render here
            was removed — casi-obs's own Standby-scene overlay (a separate
            server-side HTML page, not part of this app) already draws a
            permanent glowing "casi.gg" mark in the same bottom-left corner,
            and the two were overlapping/colliding on stream. Keeping one
            brand mark instead of two competing for the same corner. */}
      </div>
    </div>
  );
}

export default function OBSPage() {
  return <Suspense fallback={null}><OBSContent /></Suspense>;
}
