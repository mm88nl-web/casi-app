"use client";
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import SlotMedia from '@/components/SlotMedia';
import { getSkinById, hexToRgbStr } from '@/lib/skins';

function OBSContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('s') || 'first';
  const layer = searchParams.get('layer') || 'beams'; // 'beams' | 'backdrop' | unset = all

  const [elements, setElements] = useState<any[]>([]);
  // Loaded alongside elements so we can render banner marquees (which pull
  // their content from booking.message, not overlay_elements.image_url).
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  // Streamer accent colour — derived from their skin/theme so glow + banner
  // match the streamer's brand instead of the default purple.
  const [accentRgb, setAccentRgb] = useState('13, 207, 176'); // casi teal fallback
  const [accentHex, setAccentHex] = useState('#0DCFB0');
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    const load = async () => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, ink_color, theme_color, skin')
        .eq('username', username)
        .single();
      if (prof) {
        setProfileId(prof.id);
        const hex = prof.skin === 'custom'
          ? (prof.ink_color ?? prof.theme_color ?? getSkinById(prof.skin).ink)
          : getSkinById(prof.skin).ink;
        const rgb = hexToRgbStr(hex) ?? '13, 207, 176';
        setAccentHex(hex);
        setAccentRgb(rgb);
      }
    };
    load();
  }, [username, supabase]);

  useEffect(() => {
    if (!profileId) return;

    const loadAll = async () => {
      const [{ data: els }, { data: bks }] = await Promise.all([
        supabase.from('overlay_elements').select('*').eq('profile_id', profileId),
        supabase
          .from('bookings')
          .select('id, element_id, message, status, banner_font_px, banner_speed_secs, media_offset_x, media_offset_y, media_zoom')
          .eq('profile_id', profileId)
          .eq('status', 'active'),
      ]);

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

    const elCh = supabase.channel(`obs_els_${layer}_${profileId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'overlay_elements',
        filter: `profile_id=eq.${profileId}`,
      }, () => loadAll())
      .subscribe();

    // Banner content lives on bookings (message field), so the OBS render
    // needs to hear about booking transitions too — not just element
    // edits. Without this subscription, a banner approved by the streamer
    // wouldn't appear until the streamer also touched the slot.
    const bkCh = supabase.channel(`obs_bks_${layer}_${profileId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `profile_id=eq.${profileId}`,
      }, () => loadAll())
      .subscribe();

    // Safety-refresh fallback. OBS browser sources run in CEF, which can
    // throttle background JS — so a Supabase realtime push (e.g. a beam the
    // streamer just approved) can land seconds late, sometimes ~30s. Polling
    // as a backstop guarantees a newly-active beam shows within a few seconds
    // regardless of realtime delivery. The render keys (`el.id` /
    // `${el.id}-${active?.id}`) are stable, so an unchanged refresh causes no
    // remount, flicker, or glow-animation replay; the queries are tiny and
    // scoped to one profile_id.
    const poll = setInterval(loadAll, 4000);

    return () => {
      supabase.removeChannel(elCh);
      supabase.removeChannel(bkCh);
      clearInterval(poll);
    };
  }, [profileId, layer, supabase]);

  const getActive = (elId: string) => activeBookings.find(b => b.element_id === elId) || null;

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden">
      <style>{`
        /* Force the page transparent so OBS composites the beams over the
           streamer's video. globals.css paints the cream --paper on <html>
           (added in #148 to kill the mobile dark-flash); without this override
           that cream leaks into the browser source as a solid rectangle. */
        html, body { background: transparent !important; }
        /* Shape mask + one-shot glow + banner marquee.
           Accent colour is derived from the streamer's skin/theme at load time
           so glow and banner edges match their brand colour. */
        @keyframes beamGlow    { 0%{box-shadow:0 0 0 rgba(${accentRgb},0)} 15%{box-shadow:0 0 42px 8px rgba(${accentRgb},0.85)} 100%{box-shadow:0 0 0 rgba(${accentRgb},0)} }
        @keyframes beamMarquee { from{transform:translateX(100%)} to{transform:translateX(-100%)} }
        .obs-shape-circle  { clip-path: circle(50%); }
        .obs-glow          { animation: beamGlow 3s ease-out 1; will-change: box-shadow; }
        .obs-banner        { display:flex; align-items:center; width:100%; height:100%; overflow:hidden; background:rgba(0,0,0,0.78); border-top:2px solid rgba(${accentRgb},0.4); border-bottom:2px solid rgba(${accentRgb},0.4); white-space:nowrap; }
        .obs-banner-track  { display:inline-block; padding-left:100%; color:${accentHex}; font-family:var(--font-casi-sans),sans-serif; font-weight:800; font-size:28px; letter-spacing:1px; animation: beamMarquee 20s linear infinite; }
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
          const hasCustomCrop = offX !== 50 || offY !== 50 || zoom !== 1;
          const useCover = el.is_background || el.shape === 'circle' || el.shape === 'custom' || hasCustomCrop;

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
                    objectPosition: `${offX}% ${offY}%`,
                    transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                    pointerEvents: 'none',
                    filter: el.is_background ? undefined : 'drop-shadow(0 10px 30px rgba(0,0,0,0.5))',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OBSPage() {
  return <Suspense fallback={null}><OBSContent /></Suspense>;
}
