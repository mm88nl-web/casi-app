"use client";
import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

function OBSContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('s') || 'first';
  const layer = searchParams.get('layer') || 'beams'; // 'beams' | 'backdrop' | unset = all

  const [elements, setElements] = useState<any[]>([]);
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

    const loadElements = async () => {
      const { data } = await supabase.from('overlay_elements').select('*').eq('profile_id', profileId);
      let filtered = (data || []).filter(el => el.image_url && el.image_url.length > 0);

      // Filter by layer
      if (layer === 'beams') {
        filtered = filtered.filter(el => !el.is_background);
      } else if (layer === 'backdrop') {
        filtered = filtered.filter(el => el.is_background);
      }
      // no layer param = show all (legacy single-source mode)

      setElements(filtered);
    };

    loadElements();

    const channel = supabase.channel(`obs_${layer}_${profileId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'overlay_elements',
        filter: `profile_id=eq.${profileId}`,
      }, () => loadElements())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profileId, layer, supabase]);

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden">
      <div className="relative w-full h-full">
        {elements.map((el) => (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: `${el.pos_x}%`,
              top: `${el.pos_y}%`,
              width: `${el.width}%`,
              height: `${el.height}%`,
              zIndex: el.is_background ? 10 : 50,
              transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              willChange: 'transform',
            }}
          >
            <img
              src={el.image_url}
              className={`w-full h-full pointer-events-none ${el.is_background ? 'object-cover' : 'object-fill drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]'}`}
              alt=""
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OBSPage() {
  return <Suspense fallback={null}><OBSContent /></Suspense>;
}
