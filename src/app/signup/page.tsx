"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Signup is now part of the combined auth page at /login
export default function SignupRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/login?tab=signup'); }, [router]);
  return null;
}
