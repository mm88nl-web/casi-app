"use client";
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import SlotMedia from '@/components/SlotMedia';

function OBSContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('s') || 'first';
  const layer = searchParams.get('layer') || 'beams'; // 'beams' | 'backdrop' | unset = all

  const [elements, setElements] = useState<any[]>([]);
  // Loaded alongside elements so we can render banner marquees (which pull
  // their content from booking.message, not overlay_elements.image_url).
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    const load = async () => {
      const { data: prof } = await supabase.from('profiles').select('id').eq('username', username).single();
      if (prof) setProfileId(prof.id);
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
          .select('id, element_id, message, status')
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

    return () => {
      supabase.removeChannel(elCh);
      supabase.removeChannel(bkCh);
    };
  }, [profileId, layer, supabase]);

  const getActive = (elId: string) => activeBookings.find(b => b.element_id === elId) || null;

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden">
      <style>{`
        /* Shape mask + one-shot glow + banner marquee.
           Parity with overlay/page.tsx so streamers using the split-layer
           OBS URLs (?layer=beams, ?layer=backdrop) see the same visual
           treatment as viewers on /overlay. Colours are hardcoded to the
           default accent for now; per-streamer theme integration lives
           in a future iteration (SkinProvider isn't loaded on /obs). */
        @keyframes beamGlow    { 0%{box-shadow:0 0 0 rgba(153,69,255,0)} 15%{box-shadow:0 0 42px 8px rgba(153,69,255,0.85)} 100%{box-shadow:0 0 0 rgba(153,69,255,0)} }
        @keyframes beamMarquee { from{transform:translateX(100%)} to{transform:translateX(-100%)} }
        .obs-shape-rounded { border-radius: 14px; overflow: hidden; }
        .obs-shape-circle  { clip-path: circle(50%); }
        .obs-shape-hex     { clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); }
        .obs-glow          { animation: beamGlow 3s ease-out 1; will-change: box-shadow; }
        .obs-banner        { display:flex; align-items:center; width:100%; height:100%; overflow:hidden; background:rgba(0,0,0,0.78); border-top:2px solid rgba(153,69,255,0.4); border-bottom:2px solid rgba(153,69,255,0.4); white-space:nowrap; }
        .obs-banner-track  { display:inline-block; padding-left:100%; color:#9945FF; font-family:'Syne',sans-serif; font-weight:800; font-size:28px; letter-spacing:1px; animation: beamMarquee 20s linear infinite; }
      `}</style>
      <div className="relative w-full h-full">
        {elements.map((el) => {
          const active = getActive(el.id);
          const isBannerActive = el.shape === 'banner' && !!active?.message;
          const shapeClass =
            el.shape === 'rounded' ? 'obs-shape-rounded' :
            el.shape === 'circle'  ? 'obs-shape-circle'  :
            el.shape === 'hex'     ? 'obs-shape-hex'     :
            '';
          const glowClass = !!active && (el.glow_on_start ?? true) && !el.is_background ? 'obs-glow' : '';
          // Keyed on the active booking so each fresh beam re-mounts and
          // the glow animation plays from zero. Matches /overlay behaviour.
          const mediaKey = `${el.id}-${active?.id ?? 'none'}`;

          // Banner: render the viewer's message as a marquee instead of
          // their uploaded image (they may not have uploaded one at all).
          if (isBannerActive) {
            return (
              <div key={el.id} style={{
                position: 'absolute',
                left: `${el.pos_x}%`, top: `${el.pos_y}%`,
                width: `${el.width}%`, height: `${el.height}%`,
                zIndex: 50,
                transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
              }}>
                <div key={mediaKey} className={`obs-banner ${glowClass}`.trim()}>
                  <span className="obs-banner-track">{active.message}</span>
                </div>
              </div>
            );
          }

          // Image/video slot — skip rows that have no media set yet; they
          // haven't had an active beam on them. (Banner rows handled above.)
          if (!el.image_url) return null;

          return (
            <div key={el.id} style={{
              position: 'absolute',
              left: `${el.pos_x}%`, top: `${el.pos_y}%`,
              width: `${el.width}%`, height: `${el.height}%`,
              zIndex: el.is_background ? 10 : 50,
              transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
              willChange: 'transform',
            }}>
              <div
                key={mediaKey}
                className={`${shapeClass} ${glowClass}`.trim()}
                style={{ width: '100%', height: '100%' }}
              >
                <SlotMedia
                  src={el.image_url}
                  fileType={null}
                  style={{
                    width: '100%',
                    height: '100%',
                    // Beam slots: contain so the viewer's upload keeps its
                    // aspect ratio. Backdrop: cover so the full canvas
                    // stays filled (edges crop, not stretch).
                    objectFit: el.is_background ? 'cover' : 'contain',
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
