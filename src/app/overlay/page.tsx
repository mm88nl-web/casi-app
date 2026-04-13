"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

function Logo({ scale = 0.32, color = '#F58220', bg = '#050505' }: { scale?: number; color?: string; bg?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width={400 * scale} height={200 * scale}>
      <g stroke={color} fill={color} strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path fill={color} stroke="none" d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z" />
      <circle fill={bg} cx="200" cy="100" r="45" />
    </svg>
  );
}

function getSecondsRemaining(booking: any): number {
  if (!booking?.started_at || !booking?.duration_minutes) return 0;
  const started = new Date(booking.started_at).getTime();
  const expiresAt = started + booking.duration_minutes * 60 * 1000;
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}
function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function Countdown({ booking, onWarning }: { booking: any; onWarning?: (s: number) => void }) {
  const [seconds, setSeconds] = useState(getSecondsRemaining(booking));
  useEffect(() => {
    const interval = setInterval(() => {
      const s = getSecondsRemaining(booking);
      setSeconds(s);
      if (onWarning) onWarning(s);
    }, 1000);
    return () => clearInterval(interval);
  }, [booking, onWarning]);
  return <span>{formatTime(seconds)}</span>;
}

const VIEWER_NAME_KEY = 'casi_viewer_name';
const ADJECTIVES = ['Cool','Fast','Bold','Wild','Epic','Slick','Dark','Neon','Hyper','Ultra','Turbo','Mega','Swift','Storm','Blaze'];
const ANIMALS    = ['Tiger','Panda','Fox','Wolf','Hawk','Bear','Shark','Eagle','Viper','Lynx','Raven','Cobra','Falcon','Bison','Orca'];
function generateRandomName() {
  const adj    = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}${animal}${Math.floor(Math.random() * 99) + 1}`;
}

function NameEntryScreen({ onConfirm, tc }: { onConfirm: (name: string) => void; tc: string }) {
  const [name, setName] = useState(generateRandomName());
  const [showNote, setShowNote] = useState(false);
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap'); *{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{ minHeight:'100vh', background:'#050505', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:"'Syne',sans-serif" }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:40 }}>
            <Logo scale={0.5} color={tc} />
            <div style={{ fontSize:28, fontWeight:800, color:tc, letterSpacing:-1, marginTop:8 }}>casi</div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:3, textTransform:'uppercase', color:'#444', marginTop:4 }}>Viewer</div>
          </div>
          <div style={{ background:'#0a0a0a', border:'1px solid #1c1c1c', borderRadius:16, padding:28, marginBottom:12 }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#555', marginBottom:16 }}>Pick a name for this stream</div>
            <div style={{ position:'relative', marginBottom:8 }}>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key==='Enter' && name.trim() && onConfirm(name.trim())}
                maxLength={24} autoFocus
                style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid #1c1c1c', borderRadius:10, padding:'13px 16px', paddingRight:90, fontSize:15, fontWeight:700, color:'#e8e8e8', outline:'none', fontFamily:"'Syne',sans-serif" }}
                onFocus={(e)=>e.target.style.borderColor=`${tc}60`}
                onBlur={(e)=>e.target.style.borderColor='#1c1c1c'} />
              <button onClick={() => setName(generateRandomName())}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontFamily:"'DM Mono',monospace", fontSize:10, color:'#555', cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>
                ↺ random
              </button>
            </div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#333', marginBottom:20 }}>A random name was generated — change it or keep it.</div>
            <button onClick={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()}
              style={{ width:'100%', background:name.trim()?tc:'#1c1c1c', border:'none', borderRadius:10, padding:14, fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, textTransform:'uppercase', letterSpacing:0.5, color:'#050505', cursor:name.trim()?'pointer':'not-allowed', transition:'all .2s' }}>
              Enter stream →
            </button>
          </div>
          <button onClick={() => setShowNote(!showNote)}
            style={{ width:'100%', background:'none', border:'none', fontFamily:"'DM Mono',monospace", fontSize:10, color:'#333', cursor:'pointer', textTransform:'uppercase', letterSpacing:1.5, padding:'10px 0' }}>
            Have an account? Sign in
          </button>
          {showNote && (
            <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid #111', borderRadius:10, padding:16, textAlign:'center', marginTop:8 }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'#444', lineHeight:1.7 }}>Account sign-in coming soon.<br/>Your name is saved on this device for now.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function OverlayContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('s') || '';
  const isOBS = searchParams.get('mode') === 'obs';

  const [elements, setElements]         = useState<any[]>([]);
  const [profile, setProfile]           = useState<any>(null);
  const [activeBookings, setActiveBookings]   = useState<any[]>([]);
  const [approvedQueuedBookings, setApprovedQueuedBookings] = useState<any[]>([]);
  const [queueCounts, setQueueCounts]   = useState<Record<string,number>>({});
  const [loading, setLoading]           = useState(true);
  const [myBookings, setMyBookings]     = useState<any[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<Set<string>>(new Set());
  const [savedViewerName, setSavedViewerName] = useState<string|null>(null);
  const [nameConfirmed, setNameConfirmed]     = useState(false);
  const [showChangeName, setShowChangeName]   = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [isQueue, setIsQueue]           = useState(false);
  const [isExtend, setIsExtend]         = useState(false);
  const [imageUrl, setImageUrl]         = useState('');
  const [imageValid, setImageValid]     = useState(false);
  const [message, setMessage]           = useState('');
  const [duration, setDuration]         = useState(30);
  const [submitting, setSubmitting]     = useState(false);
  const [cancelling, setCancelling]     = useState<string|null>(null);
  const [notification, setNotification] = useState<{text:string;type:string}|null>(null);

  // ── Wallet state ──────────────────────────────────────────────────────────
  const { wallet, connected, connecting, connect, disconnect, publicKey, signTransaction, signAllTransactions } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  // Only connect when the user explicitly clicked a Connect button.
  // Without this guard the effect fires on page load because Wallet Standard
  // registers Phantom into `wallet` automatically, causing an instant popup.
  const userInitiatedConnect = useRef(false);
  useEffect(() => {
    if (wallet && !connected && !connecting && userInitiatedConnect.current) {
      userInitiatedConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const openWalletModal = () => {
    userInitiatedConnect.current = true;
    if (wallet) {
      connect().catch(() => {});
    } else {
      setWalletModalVisible(true);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const supabase = useRef(createClient()).current;
  const viewerNameRef = useRef('');

  // Theme color — derived from profile, falls back to Casi orange
  const tc = profile?.theme_color || '#F58220';

  useEffect(() => {
    if (!isOBS && !username) window.location.href = '/search';
  }, [username, isOBS]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEWER_NAME_KEY);
      if (saved) { setSavedViewerName(saved); viewerNameRef.current = saved; setNameConfirmed(true); }
    } catch {}
  }, []);

  const confirmName = (name: string) => {
    try { localStorage.setItem(VIEWER_NAME_KEY, name); } catch {}
    setSavedViewerName(name); viewerNameRef.current = name; setNameConfirmed(true);
  };

  const showNotif = (text: string, type: string) => {
    setNotification({text, type});
    setTimeout(() => setNotification(null), 5000);
  };

  const loadData = useCallback(async (profId: string, nameOverride?: string) => {
    const name = nameOverride ?? viewerNameRef.current;
    const [{ data: els }, { data: active }, { data: aq }, { data: queued }] = await Promise.all([
      supabase.from('overlay_elements').select('*').eq('profile_id', profId),
      supabase.from('bookings').select('*').eq('profile_id', profId).eq('status','active'),
      supabase.from('bookings').select('*').eq('profile_id', profId).eq('status','approved_queued').order('approved_at',{ascending:true}),
      supabase.from('bookings').select('element_id').eq('profile_id', profId).eq('status','pending'),
    ]);
    // Filter out beams with no price on viewer overlay
    setElements((els||[]).filter((el:any) => el.is_background || el.price_value > 0));
    setActiveBookings(active||[]);
    setApprovedQueuedBookings(aq||[]);
    const counts: Record<string,number> = {};
    (queued||[]).forEach((b:any) => { if (b.element_id) counts[b.element_id]=(counts[b.element_id]||0)+1; });
    setQueueCounts(counts);
    if (name) {
      const { data: mine } = await supabase.from('bookings').select('*')
        .eq('profile_id', profId).eq('viewer_name', name)
        .in('status',['pending','active','approved_queued'])
        .order('created_at',{ascending:false});
      const relevant = (mine||[]).filter((b:any) => b.status!=='denied' || Date.now()-new Date(b.created_at).getTime()<30000);
      setMyBookings(relevant);
    }
  }, [supabase]);

  useEffect(() => {
    if (!username) return;
    let cleanup: (()=>void)|undefined;
    const init = async () => {
      const { data: prof } = await supabase.from('profiles').select('*').eq('username', username).single();
      setProfile(prof);
      if (prof) {
        const saved = (() => { try { return localStorage.getItem(VIEWER_NAME_KEY)||''; } catch { return ''; } })();
        viewerNameRef.current = saved;
        await loadData(prof.id, saved);
        setLoading(false);
        const channel = supabase.channel(`overlay_${prof.id}`)
          .on('postgres_changes',{event:'*',schema:'public',table:'overlay_elements',filter:`profile_id=eq.${prof.id}`},()=>loadData(prof.id))
          .on('postgres_changes',{event:'*',schema:'public',table:'bookings',filter:`profile_id=eq.${prof.id}`},()=>loadData(prof.id))
          .subscribe();
        cleanup = () => { supabase.removeChannel(channel); };
      } else { setLoading(false); }
    };
    init();
    return () => { if (cleanup) cleanup(); };
  }, [username, supabase, loadData]);

  const prevMyBookingsRef = useRef<any[]>([]);

  // 1. Status Change Notifications
  useEffect(() => {
    const prev = prevMyBookingsRef.current;
    myBookings.forEach(booking => {
      const old = prev.find((b: any) => b.id === booking.id);
      if (!old) return;
      if (old.status === 'pending' && booking.status === 'denied')          showNotif('Your request was denied', 'denied');
      if (old.status === 'pending' && booking.status === 'active')          showNotif('Your beam is live! 🎉', 'success');
      if (old.status === 'pending' && booking.status === 'approved_queued') showNotif("Approved — you're in the queue!", 'queue');
    });
    prevMyBookingsRef.current = myBookings;
  }, [myBookings]);

  // 2. Stripe Payment Return Handler
  useEffect(() => {
    if (!profile) return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const bookingId = params.get('booking_id');

    if (payment === 'success' && bookingId) {
      showNotif('Payment successful — request sent! 🎉', 'success');
      // Clean up the URL so the viewer doesn't see Stripe parameters
      const clean = `${window.location.pathname}?s=${profile.username}`;
      window.history.replaceState({}, '', clean);
    }

    if (payment === 'cancelled' && bookingId) {
      // Mark as denied in DB so the pending slot clears
      supabase.from('bookings').update({ status: 'denied' }).eq('id', bookingId).then(() => {
        if (typeof loadData === 'function') {
          loadData(profile.id, savedViewerName ?? undefined);
        }
      });
      showNotif('Payment cancelled', 'warning');
      const clean = `${window.location.pathname}?s=${profile.username}`;
      window.history.replaceState({}, '', clean);
    }
  }, [profile]);

  const getActiveBookingForSlot = (id: string) => activeBookings.find((b:any) => b.element_id===id)||null;
  const getMyBookingForSlot     = (id: string) => myBookings.find((b:any) => b.element_id===id && b.status!=='denied')||null;

  const canExtend = (elementId: string) => {
    const queueBehind = approvedQueuedBookings.filter((b:any) => b.element_id===elementId);
    return queueBehind.length === 0 && (queueCounts[elementId]||0) === 0;
  };

  const cancelBooking = async (bookingId: string) => {
  setCancelling(bookingId);
  // Call cancel API which handles both Stripe + DB
  await fetch('/api/stripe/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking_id: bookingId }),
  });
  setCancelling(null);
  showNotif('Booking cancelled', 'warning');
  if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
};

  const openSlot = (el: any, joinQueue: boolean, extend=false) => {
    setSelectedSlot(el); setIsQueue(joinQueue); setIsExtend(extend);
    setImageUrl(''); setImageValid(false); setMessage('');
    const maxDur = el.max_duration_minutes;
    setDuration(maxDur ? Math.min(30,maxDur) : 30);
    if (extend) {
      const myBooking = getMyBookingForSlot(el.id);
      if (myBooking?.image_url) { setImageUrl(myBooking.image_url); setImageValid(true); }
    }
  };
  const closeSlot = () => { setSelectedSlot(null); setIsExtend(false); };
  const setDurationClamped = (val: number) => {
    const max = selectedSlot?.max_duration_minutes;
    setDuration(max ? Math.min(val,max) : val);
  };

  const submitBooking = async () => {
  if (!savedViewerName || !imageUrl || !selectedSlot) return;
  setSubmitting(true);

  // Clean up any stale unpaid pending bookings for this slot+viewer
  await supabase
    .from('bookings')
    .update({ status: 'denied' })
    .eq('profile_id', profile.id)
    .eq('element_id', selectedSlot.id)
    .eq('viewer_name', savedViewerName)
    .eq('status', 'pending')
    .is('payment_intent_id', null);

  if (!isExtend) {
  const { data: existing } = await supabase.from('bookings').select('id')
    .eq('profile_id', profile.id)
    .eq('element_id', selectedSlot.id)
    .eq('viewer_name', savedViewerName)
    .in('status', ['pending', 'active', 'approved_queued'])
    .single();
  if (existing) {
    setSubmitting(false);
    showNotif('You already have a booking for this slot', 'warning');
    closeSlot();
    return;
  }
}

  const currentQueue = queueCounts[selectedSlot.id] || 0;

  const { data: newBooking, error: insertError } = await supabase.from('bookings').insert({
    profile_id: profile.id,
    element_id: selectedSlot.id,
    viewer_name: savedViewerName,
    image_url: imageUrl,
    message: isExtend ? `⏱ Extension request${message.trim() ? ' — ' + message.trim() : ''}` : (message.trim() || null),
    duration_minutes: duration,
    price_value: selectedSlot.price_value,
    price_unit: selectedSlot.price_unit,
    status: 'pending',
    is_queued: isQueue || isExtend,
    queue_position: (isQueue || isExtend) ? currentQueue + 1 : null,
  }).select().single();

  if (insertError || !newBooking) {
    console.error('Insert error:', insertError);
    showNotif('Failed to create booking', 'error');
    setSubmitting(false);
    return;
  }

  if (false) {
  // extend now pays via Stripe like direct bookings
} else {
    try {
      const res = await fetch('/api/stripe/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: newBooking.id }),
      });
      const json = await res.json();
      if (json.checkout_url) {
        window.location.href = json.checkout_url;
      } else {
        console.error('Stripe error:', json.error);
        showNotif(json.error || 'Payment failed to initialize', 'error');
        setSubmitting(false);
      }
    } catch (err) {
      console.error('Authorize fetch failed:', err);
      showNotif('Server error. Please try again.', 'error');
      setSubmitting(false);
    }
  }
};

  // ── Solana / Streamflow booking ────────────────────────────────────────────
  const submitSolanaBooking = async () => {
    if (!savedViewerName || !imageUrl || !selectedSlot || !publicKey || !wallet?.adapter) return;
    if (!profile?.solana_wallet) {
      showNotif('This streamer has not linked a Solana wallet yet', 'denied');
      return;
    }
    setSubmitting(true);

    // Clean up any stale Solana-pending bookings that never got a stream
    await supabase.from('bookings').update({ status: 'denied' })
      .eq('profile_id', profile.id).eq('element_id', selectedSlot.id)
      .eq('viewer_name', savedViewerName).eq('status', 'pending')
      .eq('payment_method', 'solana').is('stream_id', null);

    // Duplicate check
    if (!isExtend) {
      const { data: existing } = await supabase.from('bookings').select('id')
        .eq('profile_id', profile.id).eq('element_id', selectedSlot.id)
        .eq('viewer_name', savedViewerName).in('status', ['pending','active','approved_queued'])
        .single();
      if (existing) {
        setSubmitting(false);
        showNotif('You already have a booking for this slot', 'warning');
        closeSlot();
        return;
      }
    }

    const currentQueue = queueCounts[selectedSlot.id] || 0;
    const { data: newBooking, error: insertError } = await supabase.from('bookings').insert({
      profile_id: profile.id,
      element_id: selectedSlot.id,
      viewer_name: savedViewerName,
      image_url: imageUrl,
      message: isExtend ? `⏱ Extension request${message.trim() ? ' — ' + message.trim() : ''}` : (message.trim() || null),
      duration_minutes: duration,
      price_value: selectedSlot.price_value,
      price_unit: selectedSlot.price_unit,
      status: 'pending',
      payment_method: 'solana',
      is_queued: isQueue || isExtend,
      queue_position: (isQueue || isExtend) ? currentQueue + 1 : null,
    }).select().single();

    if (insertError || !newBooking) {
      showNotif('Failed to create booking', 'error');
      setSubmitting(false);
      return;
    }

    try {
      // Dynamic import keeps Streamflow out of the initial bundle
      const { SolanaStreamClient, getBN, ICluster } = await import('@streamflow/stream');
      const { Connection, PublicKey }               = await import('@solana/web3.js');

      const USDC_DEVNET  = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
      const RPC_DEVNET   = 'https://api.devnet.solana.com';
      const usdcDecimals = 6;
      const totalUsdc    = selectedSlot.price_unit === 'min'
        ? selectedSlot.price_value * duration
        : selectedSlot.price_value * (duration / 60);

      // ── Pre-flight: verify viewer has a USDC ATA with enough balance ──────
      const connection = new Connection(RPC_DEVNET);
      const { value: tokenAccounts } = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { mint: new PublicKey(USDC_DEVNET) },
      );

      if (tokenAccounts.length === 0) {
        showNotif('You need devnet USDC in your wallet. Get some at spl-token-faucet.vercel.app', 'denied');
        await supabase.from('bookings').update({ status: 'denied' }).eq('id', newBooking.id);
        setSubmitting(false);
        return;
      }

      const usdcBalance: number =
        tokenAccounts[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;

      if (usdcBalance < totalUsdc) {
        showNotif(
          `Insufficient USDC: you have ${usdcBalance.toFixed(2)}, need ${totalUsdc.toFixed(2)}`,
          'denied',
        );
        await supabase.from('bookings').update({ status: 'denied' }).eq('id', newBooking.id);
        setSubmitting(false);
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      const client = new SolanaStreamClient(RPC_DEVNET, ICluster.Devnet);
      const { txId, metadataId } = await client.create(
        {
          recipient:               profile.solana_wallet,
          tokenId:                 USDC_DEVNET,
          start:                   Math.floor(Date.now() / 1000),
          amount:                  getBN(totalUsdc, usdcDecimals),
          period:                  60,                                          // release every 60 s
          amountPerPeriod:         getBN(totalUsdc / duration, usdcDecimals),  // per minute
          cliff:                   Math.floor(Date.now() / 1000),
          cliffAmount:             getBN(0, usdcDecimals),
          cancelableBySender:      true,
          cancelableByRecipient:   false,
          transferableBySender:    false,
          transferableByRecipient: false,
          automaticWithdrawal:     true,
          canTopup:                false,
          name:                    `Casi Beam — ${savedViewerName}`,
        },
        { sender: wallet.adapter as any },
      );

      // Persist stream reference so the webhook and cancel flow can look it up
      await supabase.from('bookings').update({ stream_id: metadataId, tx_signature: txId })
        .eq('id', newBooking.id);

      showNotif('◎ Stream started — beam pending approval!', 'success');
      closeSlot();
      if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
    } catch (err: any) {
      // Extract simulation logs from SendTransactionError before logging
      let simLogs: string[] = [];
      if (typeof err?.getLogs === 'function') {
        simLogs = await err.getLogs().catch(() => []);
      }
      console.error('Streamflow error:', err?.message, '\nSim logs:', simLogs);

      // Map common on-chain errors to actionable messages
      const msg: string = err?.message ?? '';
      const logs = simLogs.join(' ');
      let userMsg = 'Solana payment failed — please try again';

      if (msg.includes('AccountNotFound') || logs.includes('AccountNotFound')) {
        userMsg = 'USDC token account not found on devnet. Get USDC at spl-token-faucet.vercel.app';
      } else if (msg.includes('insufficient funds') || logs.includes('0x1')) {
        userMsg = 'Insufficient USDC balance in your wallet';
      } else if (msg.includes('User rejected') || msg.includes('rejected the request')) {
        userMsg = 'Transaction rejected in wallet';
      } else if (msg.includes('Blockhash not found')) {
        userMsg = 'Transaction expired — please try again';
      }

      await supabase.from('bookings').update({ status: 'denied' }).eq('id', newBooking.id);
      showNotif(userMsg, 'denied');
    }

    setSubmitting(false);
  };

  const cancelSolanaStream = async (booking: any) => {
    if (!wallet?.adapter) return;
    try {
      const { SolanaStreamClient, ICluster } = await import('@streamflow/stream');
      const client = new SolanaStreamClient('https://api.devnet.solana.com', ICluster.Devnet);
      await client.cancel({ id: booking.stream_id }, { invoker: wallet.adapter as any });
    } catch (err) {
      console.error('Streamflow cancel error:', err);
    }
    await supabase.from('bookings').update({ status: 'denied' }).eq('id', booking.id);
    showNotif('Solana stream cancelled ◎', 'warning');
    if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
  };
  // ──────────────────────────────────────────────────────────────────────────

  const estimatedCost = selectedSlot
    ? selectedSlot.price_unit==='min'
      ? (selectedSlot.price_value * duration).toFixed(0)
      : (selectedSlot.price_value * (duration/60)).toFixed(2)
    : '0';

  // For booking form accent: extend=yellow, queue=streamer theme, rent=streamer theme
  const accentColor = isExtend ? '#eab308' : tc;
  const visibleMyBookings = myBookings.filter((b:any) => b.status!=='denied');

  if (loading) return null;
  if (!isOBS && !nameConfirmed) return <NameEntryScreen onConfirm={confirmName} tc={tc} />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .ov { min-height:100vh; background:${isOBS?'transparent':'#050505'}; color:#e8e8e8; font-family:'Syne',sans-serif; }

        .ov-nav { display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:56px; border-bottom:1px solid #0d0d0d; background:rgba(5,5,5,0.94); backdrop-filter:blur(20px); position:sticky; top:0; z-index:50; }
        .ov-logo { display:flex; align-items:center; gap:8px; text-decoration:none; }
        .ov-wm { font-size:18px; font-weight:800; color:${tc}; letter-spacing:-0.5px; }
        .ov-nav-right { display:flex; align-items:center; gap:10px; }
        .notif { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1px; padding:5px 12px; border-radius:20px; animation:fadeIn .3s ease; white-space:nowrap; max-width:200px; overflow:hidden; text-overflow:ellipsis; }
        .viewer-chip { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.04); border:1px solid #1c1c1c; border-radius:20px; padding:5px 12px; cursor:pointer; transition:border-color .2s; }
        .viewer-chip:hover { border-color:#333; }
        .vdot { width:6px; height:6px; border-radius:50%; background:${tc}; animation:blink 1.5s infinite; flex-shrink:0; }
        .vname { font-family:'DM Mono',monospace; font-size:10px; color:#888; }
        .name-edit-input { background:rgba(255,255,255,0.05); border:1px solid ${tc}50; border-radius:8px; padding:6px 12px; font-size:12px; color:#e8e8e8; outline:none; font-family:'DM Mono',monospace; width:130px; }

        .ov-main { max-width:1200px; margin:0 auto; padding:16px 20px 48px; }

        .my-beams { background:#080808; border:1px solid #111; border-radius:12px; padding:14px 16px; margin-bottom:14px; animation:fadeIn .3s ease; }
        .my-beams-lbl { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:#444; margin-bottom:10px; }
        .my-beams-list { display:flex; flex-wrap:wrap; gap:8px; }
        .beam-chip { display:flex; align-items:center; gap:8px; border-radius:10px; padding:8px 12px; border:1px solid; font-size:12px; }
        .cancel-btn { background:none; border:none; font-family:'DM Mono',monospace; font-size:9px; color:rgba(248,113,113,0.5); cursor:pointer; text-transform:uppercase; letter-spacing:1px; transition:color .2s; padding:0; margin-left:4px; }
        .cancel-btn:hover { color:#f87171; }

        .stream-canvas { width:100%; aspect-ratio:16/9; border-radius:12px; border:1px solid #1c1c1c; background:#050505; position:relative; overflow:hidden; margin-bottom:10px; }

        .slots-sec { margin-top:20px; }
        .slots-lbl { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#444; margin-bottom:10px; display:flex; align-items:center; gap:8px; }
        .slots-lbl::before { content:''; display:block; width:16px; height:1px; background:#333; }
        .slots-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px; }
        .slot-card { background:#080808; border:1px solid #161616; border-radius:12px; padding:14px; cursor:pointer; transition:all .2s; display:flex; align-items:center; gap:10px; }
        .slot-card:hover:not(.s-disabled) { border-color:#2a2a2a; transform:translateY(-1px); }
        .slot-card.s-disabled { cursor:default; opacity:0.55; }
        .s-thumb { width:36px; height:36px; border-radius:7px; overflow:hidden; background:#050505; border:1px solid #1c1c1c; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:15px; }
        .s-type  { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:#444; margin-bottom:3px; }
        .s-price { font-family:'DM Mono',monospace; font-size:13px; font-weight:500; }

        .bf { background:#080808; border-radius:14px; padding:20px; margin-top:10px; animation:fadeIn .25s ease; }
        .bf-hdr { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }
        .bf-type  { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; margin-bottom:4px; }
        .bf-price { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
        .bf-x { background:none; border:none; color:#444; cursor:pointer; font-size:18px; padding:4px; transition:color .2s; }
        .bf-x:hover { color:#e8e8e8; }
        .bf-lbl { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#555; display:block; margin-bottom:8px; }
        .bf-inp { width:100%; background:#050505; border:1px solid #1c1c1c; border-radius:10px; padding:12px 16px; font-size:14px; color:#e8e8e8; outline:none; font-family:'Syne',sans-serif; transition:border-color .2s; }
        .bf-inp::placeholder { color:#333; }
        .bf-hint { font-family:'DM Mono',monospace; font-size:10px; margin-top:6px; }
        .bf-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .dur-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .dur-btn { font-family:'DM Mono',monospace; font-size:10px; padding:7px 12px; border-radius:8px; border:1px solid #1c1c1c; background:none; color:#555; cursor:pointer; transition:all .2s; }
        .dur-btn:hover { border-color:#333; color:#e8e8e8; }
        .bf-footer { display:flex; align-items:center; justify-content:space-between; padding-top:14px; border-top:1px solid #111; margin-top:8px; gap:12px; }
        .bf-cost-lbl { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#444; }
        .bf-cost-val { font-size:22px; font-weight:800; letter-spacing:-0.5px; margin-top:2px; }
        .bf-sub { font-family:'Syne',sans-serif; font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:0.3px; padding:13px 24px; border-radius:10px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
        .bf-sub:disabled { background:#1c1c1c !important; color:#444 !important; cursor:not-allowed; }
        .bf-sub:hover:not(:disabled) { filter:brightness(1.1); transform:translateY(-1px); }

        @media (max-width:640px) {
          .ov-nav { padding:0 16px; }
          .ov-main { padding:12px 14px 60px; }
          .bf-grid { grid-template-columns:1fr; }
          .bf-footer { flex-direction:column; align-items:stretch; }
          .bf-sub { width:100%; text-align:center; }
          .slots-grid { grid-template-columns:1fr 1fr; }
        }
        @media (max-width:360px) { .slots-grid { grid-template-columns:1fr; } }
      `}</style>

      <div className="ov">
        {!isOBS && (
          <nav className="ov-nav">
            <a href="/search" className="ov-logo">
              <Logo scale={0.26} color={tc} />
              <span className="ov-wm">casi</span>
            </a>
            <div className="ov-nav-right">
              {/* Wallet Connect Button */}
              {connected && publicKey ? (
                <button
                  onClick={() => disconnect()}
                  style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:1.5, textTransform:'uppercase', background:'rgba(255,255,255,0.04)', border:'1px solid #1c1c1c', borderRadius:20, padding:'5px 12px', color:'#888', cursor:'pointer', transition:'all .2s' }}
                  onMouseEnter={e => { (e.target as HTMLButtonElement).style.color='#f87171'; (e.target as HTMLButtonElement).style.borderColor='rgba(248,113,113,0.3)'; }}
                  onMouseLeave={e => { (e.target as HTMLButtonElement).style.color='#888'; (e.target as HTMLButtonElement).style.borderColor='#1c1c1c'; }}
                >
                  {publicKey.toBase58().slice(0,4)}…{publicKey.toBase58().slice(-4)} ✕
                </button>
              ) : (
                <button
                  onClick={openWalletModal}
                  disabled={connecting}
                  style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:1.5, textTransform:'uppercase', background:'rgba(153,69,255,0.1)', border:'1px solid rgba(153,69,255,0.3)', borderRadius:20, padding:'5px 12px', color:'#9945FF', cursor:connecting?'not-allowed':'pointer', transition:'all .2s', opacity:connecting?0.6:1 }}
                >
                  {connecting ? 'Connecting…' : 'Connect Wallet'}
                </button>
              )}
              {notification && (
                <div className="notif" style={
                  notification.type==='success' ? { background:`${tc}18`, border:`1px solid ${tc}40`, color:tc } :
                  notification.type==='queue'   ? { background:`${tc}15`, border:`1px solid ${tc}35`, color:tc } :
                  notification.type==='denied'  ? { background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', color:'#f87171' } :
                  { background:'rgba(234,179,8,0.1)', border:'1px solid rgba(234,179,8,0.25)', color:'#facc15' }
                }>{notification.text}</div>
              )}
              {selectedSlot && <button onClick={closeSlot} style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#555', background:'none', border:'none', cursor:'pointer', textTransform:'uppercase', letterSpacing:1.5 }}>Cancel</button>}
              {savedViewerName && !selectedSlot && (
                showChangeName ? (
                  <input type="text" defaultValue={savedViewerName} autoFocus className="name-edit-input"
                    onKeyDown={(e) => { if(e.key==='Enter'){const v=(e.target as HTMLInputElement).value.trim(); if(v){confirmName(v);setShowChangeName(false);}} if(e.key==='Escape')setShowChangeName(false); }}
                    onBlur={(e) => { const v=e.target.value.trim(); if(v)confirmName(v); setShowChangeName(false); }} />
                ) : (
                  <div className="viewer-chip" onClick={() => setShowChangeName(true)}>
                    <span className="vdot" />
                    <span className="vname">@{savedViewerName}</span>
                  </div>
                )
              )}
            </div>
          </nav>
        )}

        <main className={isOBS ? '' : 'ov-main'}>

          {/* MY BEAMS */}
          {!isOBS && visibleMyBookings.length > 0 && !selectedSlot && (
            <div className="my-beams">
              <div className="my-beams-lbl">Your beams</div>
              <div className="my-beams-list">
                {visibleMyBookings.map((booking: any) => {
                  const isLive     = booking.status==='active';
                  const isApproved = booking.status==='approved_queued';
                  const isPending  = booking.status==='pending';
                  const isExpiring = isLive && expiringSoon.has(booking.id);
                  const activeBooking = activeBookings.find((b:any) => b.id===booking.id);
                  const canCancel = isPending || isApproved;
                  const chipStyle = isExpiring
                    ? { background:'rgba(234,179,8,0.08)', borderColor:'rgba(234,179,8,0.25)', color:'#facc15' }
                    : isLive
                    ? { background:`${tc}12`, borderColor:`${tc}35`, color:tc }
                    : isApproved
                    ? { background:`${tc}10`, borderColor:`${tc}30`, color:tc }
                    : { background:'rgba(255,255,255,0.03)', borderColor:'#1c1c1c', color:'#555' };
                  return (
                    <div key={booking.id} className="beam-chip" style={chipStyle}>
                      {booking.image_url && <img src={booking.image_url} style={{ width:20, height:20, objectFit:'contain', borderRadius:4 }} alt="" />}
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500 }}>
                        {isExpiring?'⚠ Expiring':isLive?'● Live':isApproved?'⏳ Queued':'⌛ Pending'}
                      </span>
                      {isLive && activeBooking && (
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, opacity:0.7 }}>
                          <Countdown booking={activeBooking} onWarning={(s) => {
                            if(s<=300&&s>0) setExpiringSoon(prev=>new Set(prev).add(booking.id));
                            else if(s<=0) setExpiringSoon(prev=>{const n=new Set(prev);n.delete(booking.id);return n;});
                          }} />
                        </span>
                      )}
                      {isLive && (
  <button className="cancel-btn" onClick={async () => {
    if (booking.payment_method === 'solana') {
      await cancelSolanaStream(booking);
    } else {
      await fetch('/api/stripe/end-early', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: booking.id }),
      });
      showNotif('Beam ended — prorated refund issued', 'warning');
      if (profile?.id) await loadData(profile.id, savedViewerName ?? undefined);
    }
  }}>
    ✕ end early
  </button>
)}
                      {canCancel && (
                        <button className="cancel-btn" onClick={() => cancelBooking(booking.id)} disabled={cancelling===booking.id}>
                          {cancelling===booking.id?'…':'✕ cancel'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STREAM CANVAS */}
          <div className={isOBS ? '' : 'stream-canvas'} style={isOBS ? { position:'relative', width:'100vw', height:'100vh' } : {}}>
            {elements.map((el: any) => {
              const activeBooking   = getActiveBookingForSlot(el.id);
              const isOccupied      = !!activeBooking;
              const queueCount      = queueCounts[el.id]||0;
              const isSelected      = selectedSlot?.id===el.id;
              const myBookingForSlot = getMyBookingForSlot(el.id);
              const myIsExpiring    = myBookingForSlot && expiringSoon.has(myBookingForSlot.id);
              const isLocked        = !!el.locked;
              const displayImage    = (isSelected && imageValid && imageUrl) ? imageUrl : (el.image_url||null);
              const showExtend = myBookingForSlot?.status==='active' && expiringSoon.has(myBookingForSlot.id) && canExtend(el.id);

              return (
                <div key={el.id} style={{ position:'absolute', left:`${el.pos_x}%`, top:`${el.pos_y}%`, width:`${el.width}%`, height:`${el.height}%`, zIndex:el.is_background?10:50, transition:'all 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
                  {displayImage ? (
                    <div style={{ position:'relative', width:'100%', height:'100%' }}>
                      <img src={displayImage} style={{ width:'100%', height:'100%', objectFit:el.is_background?'cover':'fill', pointerEvents:'none' }} alt="" />
                      {isSelected && imageValid && <div style={{ position:'absolute', inset:0, borderRadius:4, boxShadow:`inset 0 0 0 2px ${accentColor}80`, pointerEvents:'none' }} />}
                    </div>
                  ) : (
                    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:el.is_background?12:6, border:`1.5px dashed ${isLocked?'rgba(248,113,113,0.3)':isOccupied?`${tc}50`:el.is_background?'rgba(168,85,247,0.3)':`${tc}40`}`, background:isLocked?'rgba(248,113,113,0.03)':isOccupied?`${tc}05`:el.is_background?'rgba(168,85,247,0.03)':`${tc}05` }}>
                      <span style={{ fontSize:el.is_background?20:14, marginBottom:4 }}>{isLocked?'🔒':isOccupied?'':el.is_background?'🖼':'✦'}</span>
                      {isOccupied && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:`${tc}b0` }}><Countdown booking={activeBooking} /></span>}
                    </div>
                  )}

                  {el.price_value > 0 && !isOBS && (
                    <div style={{ position:'absolute', bottom:el.is_background?12:-54, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:5, zIndex:100, whiteSpace:'nowrap' }}>
                      <div style={{ background:'rgba(5,5,5,0.92)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'3px 10px', display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500, color:tc }}>${el.price_value}/{el.price_unit}</span>
                        {el.max_duration_minutes && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'#444' }}>· max {el.max_duration_minutes}m</span>}
                      </div>
                      {isLocked ? (
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'rgba(248,113,113,0.5)', padding:'3px 8px', border:'1px solid rgba(248,113,113,0.15)', borderRadius:20 }}>🔒 Locked</span>
                      ) : myBookingForSlot ? (
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:'3px 10px', borderRadius:20, border:'1px solid', ...(myIsExpiring?{color:'#facc15',borderColor:'rgba(234,179,8,0.3)',background:'rgba(234,179,8,0.08)'}:myBookingForSlot.status==='active'?{color:tc,borderColor:`${tc}50`,background:`${tc}12`}:myBookingForSlot.status==='approved_queued'?{color:tc,borderColor:`${tc}40`,background:`${tc}10`}:{color:'#555',borderColor:'#1c1c1c',background:'rgba(255,255,255,0.03)'}) }}>
                            {myIsExpiring?'⚠ Expiring':myBookingForSlot.status==='active'?'● Your beam is live':myBookingForSlot.status==='approved_queued'?'⏳ Queued':'⌛ Pending'}
                          </span>
                          {showExtend && (
                            <button onClick={() => openSlot(el, false, true)}
                              style={{ background:'#eab308', border:'none', borderRadius:20, padding:'4px 12px', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:10, textTransform:'uppercase', color:'#050505', cursor:'pointer' }}>
                              Extend
                            </button>
                          )}
                          {myIsExpiring && !canExtend(el.id) && (
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'rgba(234,179,8,0.5)' }}>Next viewer waiting</span>
                          )}
                        </div>
                      ) : isOccupied ? (
                        <button onClick={() => openSlot(el, true)}
                          style={{ background:tc, border:'none', borderRadius:20, padding:'5px 14px', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11, textTransform:'uppercase', color:'#050505', cursor:'pointer' }}>
                          Join queue{queueCount>0?` (${queueCount})`:''}
                        </button>
                      ) : !selectedSlot ? (
                        <button onClick={() => openSlot(el, false)}
                          style={{ background:tc, border:'none', borderRadius:20, padding:'5px 14px', fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11, textTransform:'uppercase', color:'#050505', cursor:'pointer', boxShadow:`0 4px 14px ${tc}30` }}>
                          Rent this slot
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* BOOKING FORM */}
          {!isOBS && selectedSlot && (
            <div className="bf" style={{ border:`1px solid ${accentColor}22` }}>
              <div className="bf-hdr">
                <div>
                  <div className="bf-type" style={{ color:accentColor }}>{isExtend?'⏱ Extend slot':isQueue?'⏳ Join queue':'🎯 Rent slot'}</div>
                  <div className="bf-price" style={{ color:accentColor }}>${selectedSlot.price_value}/{selectedSlot.price_unit}</div>
                </div>
                <button className="bf-x" onClick={closeSlot}>✕</button>
              </div>
              <div className="bf-grid">
                <div>
                  <div style={{ marginBottom:14 }}>
                    <label className="bf-lbl">Image or GIF URL</label>
                    <input type="text" value={imageUrl} placeholder="https://your-image.png or .gif"
                      className="bf-inp" autoFocus={!isExtend}
                      style={{ borderColor:imageValid?`${accentColor}50`:undefined }}
                      onChange={(e) => { setImageUrl(e.target.value); setImageValid(false); }} />
                    {imageUrl && <img src={imageUrl} style={{ display:'none' }} alt="" onLoad={() => setImageValid(true)} onError={() => setImageValid(false)} />}
                    <div className="bf-hint" style={{ color:imageValid?accentColor:imageUrl?'#f87171':'#444' }}>
                      {imageValid?'✓ Image loaded':imageUrl?'Image not loading — check URL':'Paste a direct image URL'}
                    </div>
                  </div>
                  <div>
                    <label className="bf-lbl">Viewing as</label>
                    <div style={{ display:'flex', alignItems:'center', gap:10, background:'#050505', border:'1px solid #1c1c1c', borderRadius:10, padding:'10px 14px' }}>
                      <span className="vdot" />
                      <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, flex:1 }}>@{savedViewerName}</span>
                      <button onClick={() => setShowChangeName(true)} style={{ background:'none', border:'none', fontFamily:"'DM Mono',monospace", fontSize:9, color:'#444', cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>change</button>
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ marginBottom:14 }}>
                    <label className="bf-lbl">Duration{selectedSlot.max_duration_minutes?` — max ${selectedSlot.max_duration_minutes}m`:''}</label>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input type="number" min={1} max={selectedSlot.max_duration_minutes||480} value={duration}
                        className="bf-inp" style={{ width:72 }}
                        onChange={(e) => setDurationClamped(Math.max(1,parseInt(e.target.value)||1))} />
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'#555' }}>min</span>
                    </div>
                    <div className="dur-row">
                      {[15,30,60].filter(d=>!selectedSlot.max_duration_minutes||d<=selectedSlot.max_duration_minutes).map(d=>(
                        <button key={d} className="dur-btn"
                          style={duration===d?{background:accentColor,borderColor:accentColor,color:'#050505',fontWeight:700}:{}}
                          onClick={() => setDurationClamped(d)}>{d}m</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="bf-lbl">Message (optional)</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                      placeholder="Anything for the streamer…" rows={3}
                      className="bf-inp" style={{ resize:'none' }} />
                  </div>
                </div>
              </div>
{isQueue && (() => {
  const active = activeBookings.find(b => b.element_id === selectedSlot?.id);
  if (!active) return null;
  const remaining = getSecondsRemaining(active) / 60;
  const queue = approvedQueuedBookings.filter(b => b.element_id === selectedSlot?.id);
  const queueMinutes = queue.reduce((sum, b) => sum + b.duration_minutes, 0);
  const wait = Math.round(remaining + queueMinutes);
  const ahead = queue.length;
  return (
    <div style={{ background: 'rgba(245,130,32,0.06)', border: '1px solid rgba(245,130,32,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#555', marginBottom: 4 }}>Estimated wait</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: '#F58220' }}>~{wait} min</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#555', marginTop: 2 }}>{ahead} booking{ahead !== 1 ? 's' : ''} ahead of you</div>
    </div>
  );
})()}
              <div className="bf-footer">
                <div>
                  <div className="bf-cost-lbl">Estimated cost</div>
                  <div className="bf-cost-val" style={{ color:accentColor }}>${estimatedCost}</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  {/* ── Stripe ── */}
                  <button onClick={submitBooking} disabled={!imageValid||submitting} className="bf-sub"
                    style={{ background:accentColor, color:'#050505', display:'flex', alignItems:'center', gap:7 }}>
                    {/* card icon */}
                    <svg width="14" height="11" viewBox="0 0 14 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="0.5" y="0.5" width="13" height="10" rx="1.5" stroke="currentColor" strokeOpacity="0.6"/>
                      <rect x="0" y="3" width="14" height="2.5" fill="currentColor" fillOpacity="0.5"/>
                      <rect x="2" y="7" width="4" height="1.5" rx="0.5" fill="currentColor"/>
                    </svg>
                    {submitting?'Sending…':isExtend?'Extend':isQueue?'Join Queue':'Send Request'}
                  </button>
                  {/* ── Solana / Streamflow ── */}
                  <button
                    disabled={connecting || submitting}
                    className="bf-sub"
                    style={{ background: connected ? '#9945FF' : 'rgba(153,69,255,0.12)', color: connected ? '#fff' : '#9945FF', border: connected ? 'none' : '1px solid rgba(153,69,255,0.35)', display:'flex', alignItems:'center', gap:7, opacity: (connecting||submitting) ? 0.6 : 1 }}
                    onClick={() => {
                      if (!connected) {
                        openWalletModal();
                      } else {
                        submitSolanaBooking();
                      }
                    }}
                  >
                    {/* Solana ◎ mark */}
                    <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1.5 8.5h8.8c.15 0 .28.06.38.16l1.1 1.1c.14.14.04.37-.17.37H2.8c-.15 0-.28-.06-.38-.16L1.33 8.87c-.14-.14-.04-.37.17-.37ZM1.5 0h8.8c.15 0 .28.06.38.16l1.1 1.1c.14.14.04.37-.17.37H2.8c-.15 0-.28-.06-.38-.16L1.33.37C1.19.23 1.29 0 1.5 0ZM11.67 4.37 10.58 5.5H1.82c-.21 0-.31-.23-.17-.37l1.1-1.1c.1-.1.23-.16.38-.16h8.37c.21 0 .31.23.17.37Z" fill="currentColor"/>
                    </svg>
                    {connecting ? 'Connecting…' : connected ? 'Pay with SOL' : 'Connect & Pay SOL'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SLOTS LIST */}
          {!isOBS && !selectedSlot && elements.filter((el:any)=>el.price_value>0).length>0 && (
            <div className="slots-sec">
              <div className="slots-lbl">Available slots</div>
              <div className="slots-grid">
                {elements.filter((el:any)=>el.price_value>0).map((el:any) => {
                  const activeBooking    = getActiveBookingForSlot(el.id);
                  const isOccupied       = !!activeBooking;
                  const queueCount       = queueCounts[el.id]||0;
                  const myBookingForSlot = getMyBookingForSlot(el.id);
                  const isLocked         = !!el.locked;
                  const priceColor       = isLocked?'#555':myBookingForSlot?'#555':tc;
                  return (
                    <button key={el.id} className={`slot-card ${myBookingForSlot||isLocked?'s-disabled':''}`}
                      style={{ borderColor:isOccupied&&!myBookingForSlot&&!isLocked?`${tc}25`:!myBookingForSlot&&!isLocked?`${tc}18`:undefined }}
                      onClick={() => !myBookingForSlot&&!isLocked&&openSlot(el,isOccupied)}>
                      <div className="s-thumb" style={{ borderColor:isOccupied?`${tc}35`:`${tc}25` }}>
                        {el.image_url?<img src={el.image_url} style={{ width:'100%',height:'100%',objectFit:'contain' }} alt="" />:<span>{isLocked?'🔒':el.is_background?'🖼':'✦'}</span>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div className="s-type">{isLocked?'Locked':myBookingForSlot?myBookingForSlot.status.replace('_',' '):isOccupied?`In use${queueCount>0?` · ${queueCount} waiting`:''}`:el.is_background?'Full Backdrop':'Beam'}</div>
                        <div className="s-price" style={{ color:priceColor }}>${el.price_value}/{el.price_unit}{el.max_duration_minutes?` · max ${el.max_duration_minutes}m`:''}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isOBS && (
            <div style={{ marginTop:36, paddingTop:20, borderTop:'1px solid #0d0d0d', textAlign:'center' }}>
              <a href="/search" style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, textTransform:'uppercase', color:'#222', textDecoration:'none' }}>
                Browse other streams →
              </a>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:20 }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:1.5, textTransform:'uppercase', color:'#888' }}>Powered by</span>
                {/* Streamflow logo — keep SVG purple, no wrapper opacity */}
                <svg width="14" height="14" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="sf-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#9945FF"/>
                      <stop offset="100%" stopColor="#6E3FD4"/>
                    </linearGradient>
                  </defs>
                  <path d="M15 30 Q50 10 85 30 Q50 50 15 30Z" fill="url(#sf-grad)"/>
                  <path d="M15 50 Q50 30 85 50 Q50 70 15 50Z" fill="url(#sf-grad)" opacity="0.75"/>
                  <path d="M15 70 Q50 50 85 70 Q50 90 15 70Z" fill="url(#sf-grad)" opacity="0.5"/>
                </svg>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:1.5, textTransform:'uppercase', color:'#888' }}>Streamflow</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default function PerfectOverlay() {
  return <Suspense fallback={null}><OverlayContent /></Suspense>;
}
