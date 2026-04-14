"use client";
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ProfileRedirect() {
  const router = useRouter();
  const params = useParams();
  const username = params?.username as string;
  useEffect(() => {
    if (username) router.replace(`/overlay?s=${username}`);
  }, [router, username]);
  return null;
}
