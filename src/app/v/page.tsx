"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function ViewerPage() {
  const [streamer, setStreamer] = useState<any>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchStreamer = async () => {
      try {
        // We look for the first profile in the database to act as our test streamer
        const { data, error: supabaseError } = await supabase
          .from('profiles')
          .select('*')
          .limit(1)
          .single();

        if (supabaseError) {
          setError("No streamers found in database. Go to /join first!");
        } else {
          setStreamer(data);
        }
      } catch (err) {
        setError("System Error: Could not connect to Supabase.");
      } finally {
        setLoading(false);
      }
    };
    fetchStreamer();
  }, []);

  if (loading) return <div className="p-20 text-center font-black animate-pulse">LOADING CASI VIBE...</div>;
  
  if (error) return (
    <div className="p-20 text-center space-y-4">
      <p className="text-red-500 font-bold">{error}</p>
      <a href="/join" className="underline">Click here to create a streamer account first</a>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-black font-sans p-6">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 mt-10">
        
        {/* Left: The Live Preview */}
        <div className="space-y-4">
          <h2 className="text-4xl font-black uppercase tracking-tighter">CASI. PREVIEW</h2>
          <div className="relative aspect-video bg-gray-100 border-4 border-black overflow-hidden shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
            {/* The background the viewer is trying out */}
            {previewImg && <img src={previewImg} className="absolute inset-0 w-full h-full object-cover" />}
            
            {/* The Streamer's Ghost (cutout) */}
            <img 
              src={streamer?.template_url} 
              className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none" 
              alt="Streamer Cutout"
            />
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Authentic Streamer Environment</p>
        </div>

        {/* Right: The Interaction */}
        <div className="flex flex-col justify-center space-y-8">
          <div className="border-l-4 border-black pl-6">
            <p className="text-xl font-bold leading-tight">
              YOU CONTROL THE VIBE.
            </p>
            <p className="text-sm text-gray-500">Upload a background to preview the change.</p>
          </div>

          <input 
            type="file" 
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPreviewImg(URL.createObjectURL(file));
            }}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:border-0 file:bg-black file:text-white file:font-bold cursor-pointer hover:file:bg-gray-800"
          />

          <button className="w-full bg-black text-white py-6 text-2xl font-black italic tracking-tighter hover:bg-white hover:text-black border-2 border-black transition-all shadow-xl">
            SECURE FOR $5.00
          </button>
        </div>

      </div>
    </div>
  );
}
