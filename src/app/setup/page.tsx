"use client";
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const handleUpload = async () => {
    if (!file) return alert("Please select a transparent PNG first.");
    setUploading(true);

    // 1. Get the current logged-in user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("Not logged in!");

    // 2. Upload file to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-ghost.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('casi-media')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      alert("Upload failed: " + uploadError.message);
    } else {
      // 3. Save the public URL to the profile table
      const { data: { publicUrl } } = supabase.storage.from('casi-media').getPublicUrl(filePath);
      
      await supabase.from('profiles')
        .update({ template_url: publicUrl })
        .eq('id', user.id);

      alert("Ghost Template Saved!");
      router.push('/admin'); // Move to the dashboard
    }
    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 border-2 border-black p-10">
        <h1 className="text-2xl font-black uppercase tracking-tighter text-center">Step 2: Your Ghost</h1>
        <p className="text-sm text-gray-500 text-center">
          Upload a transparent PNG of yourself in your streaming position.
        </p>
        
        <input 
          type="file" 
          accept="image/png" 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-black file:text-white"
        />

        <button 
          onClick={handleUpload}
          disabled={uploading}
          className="w-full bg-black text-white py-4 font-bold hover:opacity-80 transition"
        >
          {uploading ? "UPLOADING..." : "SAVE & CONTINUE"}
        </button>
      </div>
    </div>
  );
}
