import { useEffect, useRef, useState } from 'react';
import SlotMedia from '@/components/SlotMedia';
import UsdcIcon from '@/components/icons/UsdcIcon';
import { SHAPE_OPTIONS } from '@/lib/banner';
import { formatTime, getSecondsRemaining } from './time';

type Tab = 'properties' | 'pricing' | 'behavior';

function RailRow({
  glyph,
  name,
  sub,
  value,
  onChange,
  unit,
  placeholder,
  step = 0.01,
  disabled = false,
}: {
  glyph: React.ReactNode;
  name: string;
  sub: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
  /** +/− arrow increment. Defaults to 0.01 for backward compat; callers
   *  pass 1 for whole-dollar fiat ticks and 0.5 for half-USDC ticks.
   *  Free typing is unaffected — the streamer can still enter $5.50,
   *  $0.99, etc. step only governs spinner-button increments. */
  step?: number;
  /** When true the input is disabled and dimmed — used while the slot is
   *  flagged "free", since editing a rate that's about to be overridden
   *  to zero is misleading. */
  disabled?: boolean;
}) {
  return (
    <div className="casi-v9-rail-row" style={disabled ? { opacity: 0.45 } : undefined}>
      <span className="casi-v9-rail-glyph">{glyph}</span>
      <span className="casi-v9-rail-name">
        {name}
        <small>{sub}</small>
      </span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="casi-v9-rail-input"
        style={disabled ? { cursor: 'not-allowed' } : undefined}
      />
      <span className="casi-v9-rail-unit">/{unit}</span>
    </div>
  );
}

/* v9 Properties panel — three tabs (Properties / Pricing / Behavior).
 * Used inline by /admin and inside .casi-v9-cp-wrap on /studio/live.
 *
 * Distributes the existing controls into v9's tabs:
 *   - Properties: Shape pills.
 *   - Pricing:    Price + unit + free toggle + Save.
 *   - Behavior:   Glow on start + Lock toggle.
 *
 * The Done + Delete buttons live below the tabs (v9 .cp-done / .cp-del).
 * The active-booking strip stays at the very bottom — it's a status row,
 * not a control, and shouldn't move when tabs change.
 */
export default function BeamCtrlPanel({
  el,
  activeBooking,
  updateSlider, // eslint-disable-line @typescript-eslint/no-unused-vars
  updateLayer,
  toggleLock,
  deleteLayer,
  kickBeam,
  onDone,
  onUpdateShape,
  onUpdateGlow,
  stripeCurrency = 'usd',
}: {
  el: any;
  activeBooking: any | null;
  updateSlider: (id: string, updates: any) => void;
  updateLayer: (id: string, updates: any) => void;
  toggleLock: (id: string, locked: boolean) => void;
  deleteLayer: (id: string) => void;
  kickBeam: (booking: any) => void;
  onDone: () => void;
  onUpdateShape?: (id: string, shape: string) => void;
  onUpdateGlow?: (id: string, glow: boolean) => void;
  /** Stripe Connect's default currency for this streamer. Drives which
   *  Stripe row renders on the slot Pricing tab — the rate input is in
   *  whatever Stripe will actually charge in, eliminating the "rate in
   *  EUR but PI in USD" mismatch the prior free-form picker allowed.
   *  null means Stripe isn't connected; the Stripe row hides entirely
   *  and the streamer prices in USDC only. */
  stripeCurrency?: 'eur' | 'usd' | null;
}) {
  const [tab, setTab] = useState<Tab>('properties');
  // Per-rail rates — fall back to price_value when a rail isn't set on the row.
  // The legacy single price_value continues to drive the booking flow today;
  // the per-rail values are the source of truth for the studio UI and will
  // power per-rail booking once the booking flow is wired through (follow-up).
  const fallbackUsd = String(el.price_value ?? 0);
  const [rateUsd, setRateUsd] = useState<string>(String(el.prices?.usd ?? fallbackUsd));
  const [rateEur, setRateEur] = useState<string>(String(el.prices?.eur ?? fallbackUsd));
  const [rateUsdc, setRateUsdc] = useState<string>(String(el.prices?.usdc ?? fallbackUsd));
  const [editUnit, setEditUnit] = useState(el.price_unit || 'min');
  const [minMin, setMinMin] = useState<string>(
    String(el.prices?.min_min ?? el.min_duration_minutes ?? ''),
  );
  const [maxMin, setMaxMin] = useState<string>(
    String(el.prices?.max_min ?? el.max_duration_minutes ?? ''),
  );
  const [liveSeconds, setLiveSeconds] = useState(
    activeBooking ? getSecondsRemaining(activeBooking) : 0,
  );
  // Snapshot of pre-free rates so toggling Free → not-free restores
  // whatever the streamer last had instead of jumping to a hardcoded
  // default. Cleared whenever a different element is selected (the
  // useEffect below) so a stale snapshot from another slot can't leak in.
  const preFreeRatesRef = useRef<{ usd: string; eur: string; usdc: string } | null>(null);

  // Sync editor state + reset to Properties when a different element is selected
  useEffect(() => {
    const fb = String(el.price_value ?? 0);
    setRateUsd(String(el.prices?.usd ?? fb));
    setRateEur(String(el.prices?.eur ?? fb));
    setRateUsdc(String(el.prices?.usdc ?? fb));
    setEditUnit(el.price_unit || 'min');
    setMinMin(String(el.prices?.min_min ?? el.min_duration_minutes ?? ''));
    setMaxMin(String(el.prices?.max_min ?? el.max_duration_minutes ?? ''));
    preFreeRatesRef.current = null;
    setTab('properties');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id]);

  useEffect(() => {
    if (!activeBooking) return;
    setLiveSeconds(getSecondsRemaining(activeBooking));
    const iv = setInterval(() => setLiveSeconds(getSecondsRemaining(activeBooking)), 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBooking?.id]);

  const durMins = activeBooking ? Number(activeBooking.duration_minutes) : 0;
  const elapsed = activeBooking ? Math.max(0, durMins * 60 - liveSeconds) : 0;
  const earnedSoFar = activeBooking
    ? activeBooking.price_unit === 'min'
      ? ((elapsed / 60) * activeBooking.price_value).toFixed(2)
      : ((elapsed / 3600) * activeBooking.price_value).toFixed(2)
    : null;

  // "Free" mode = every visible rail is 0. The earlier definition keyed on
  // rateUsd alone, which mis-detected USDC-only slots (where rateUsd is
  // just the loaded fallback of '0' even when rateUsdc is a real price)
  // as free. Now requires zeros across the board so a slot priced at 23.5
  // USDC isn't flagged free just because its USD rail is empty.
  const numOr0 = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const beamFree =
    numOr0(rateUsd) === 0 && numOr0(rateEur) === 0 && numOr0(rateUsdc) === 0;
  const glowOn = el.glow_on_start ?? true;

  const saveRates = () => {
    const num = (s: string) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };
    const minN = num(minMin);
    const maxN = num(maxMin);
    // Only persist the Stripe rail the streamer can actually charge in.
    // The other Stripe state values (e.g. rateUsd loaded from a stale
    // legacy price_value when Stripe isn't connected) would otherwise
    // round-trip back to prices.usd and resurface in formatSlotPrice as
    // "$1/min" on a slot the streamer only set in USDC. USDC is always
    // persisted; the on-chain rail doesn't depend on Stripe.
    const usdN = stripeCurrency === 'usd' ? num(rateUsd) : null;
    const eurN = stripeCurrency === 'eur' ? num(rateEur) : null;
    const usdcN = num(rateUsdc);
    const prices = {
      usd: usdN,
      eur: eurN,
      usdc: usdcN,
      min_min: minN,
      max_min: maxN,
    };
    // Strip null keys so the JSONB stays compact AND so disconnecting
    // Stripe (or switching its currency) cleanly removes the old rail
    // from the slot — Supabase replaces the whole JSONB column on update.
    const compact = Object.fromEntries(
      Object.entries(prices).filter(([, v]) => v !== null && v !== undefined),
    );
    // Legacy `price_value` column drives free-detection (=0 means free)
    // in callers that haven't migrated to formatSlotPrice yet. Track the
    // streamer's primary rail so a USDC-only streamer setting USDC=5
    // doesn't end up with price_value=0 marking the slot as free.
    const legacyPriceValue =
      stripeCurrency === 'usd' ? num(rateUsd) ?? 0
      : stripeCurrency === 'eur' ? num(rateEur) ?? 0
      : usdcN ?? 0;
    updateLayer(el.id, {
      price_value: legacyPriceValue,
      price_unit: editUnit,
      prices: compact,
      min_duration_minutes: minN,
      max_duration_minutes: maxN,
    });
  };

  return (
    <div className="beam-ctrl casi-v9-cp-inner">
      {/* Tabs */}
      <div className="casi-v9-cp-tabs">
        <button
          type="button"
          onClick={() => setTab('properties')}
          className={`casi-v9-cp-tab${tab === 'properties' ? ' casi-v9-on' : ''}`}
        >
          Properties
        </button>
        <button
          type="button"
          onClick={() => setTab('pricing')}
          className={`casi-v9-cp-tab${tab === 'pricing' ? ' casi-v9-on' : ''}`}
        >
          Pricing
        </button>
        <button
          type="button"
          onClick={() => setTab('behavior')}
          className={`casi-v9-cp-tab${tab === 'behavior' ? ' casi-v9-on' : ''}`}
        >
          Behavior
        </button>
      </div>

      {/* Properties — Shape pills */}
      {tab === 'properties' && onUpdateShape && (
        <div className="casi-v9-cp-pane">
          <div className="casi-v9-cp-lbl">Shape</div>
          <div className="casi-v9-shape-btns">
            {SHAPE_OPTIONS.map((s) => {
              const active = (el.shape || 'rect') === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onUpdateShape(el.id, s.id)}
                  className={`casi-v9-shape-b${active ? ' casi-v9-on' : ''}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pricing — per-rail rates + min/max duration */}
      {tab === 'pricing' && (
        <div className="casi-v9-cp-pane">
          <div className="casi-v9-cp-lbl">Per-rail rates</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Stripe rail — rendered in the streamer's Stripe Connect
                default currency. Hidden entirely when Stripe isn't
                connected (stripeCurrency === null) so the streamer can't
                set a rate that nothing will charge against — they price
                in USDC only until Stripe is hooked up via Settings. */}
            {stripeCurrency === 'eur' ? (
              <RailRow
                glyph={<span style={{ color: 'var(--ink)' }}>€</span>}
                name="EUR"
                sub="via Stripe"
                value={rateEur}
                onChange={setRateEur}
                unit={editUnit}
                step={1}
                disabled={beamFree}
              />
            ) : stripeCurrency === 'usd' ? (
              <RailRow
                glyph={<span style={{ color: 'var(--ink)' }}>$</span>}
                name="USD"
                sub="via Stripe"
                value={rateUsd}
                onChange={setRateUsd}
                unit={editUnit}
                step={1}
                disabled={beamFree}
              />
            ) : null}
            <RailRow
              glyph={<UsdcIcon size={14} />}
              name="USDC"
              sub="on-chain · Solana"
              value={rateUsdc}
              onChange={setRateUsdc}
              unit={editUnit}
              step={0.5}
              disabled={beamFree}
            />
          </div>
          <div className="casi-v9-cp-row">
            <span className="casi-v9-cp-lbl">Per</span>
            <select
              value={editUnit}
              onChange={(e) => setEditUnit(e.target.value)}
              className="casi-v9-cp-input"
              style={{ width: 'auto' }}
            >
              <option value="min">/ minute</option>
              <option value="hr">/ hour</option>
            </select>
          </div>
          <div className="casi-v9-cp-row">
            <span className="casi-v9-cp-lbl">Min duration</span>
            <input
              type="number"
              min={0}
              step={0.5}
              placeholder="—"
              value={minMin}
              onChange={(e) => setMinMin(e.target.value)}
              className="casi-v9-cp-input"
              style={{ width: 80, textAlign: 'right' }}
            />
          </div>
          <div className="casi-v9-cp-row">
            <span className="casi-v9-cp-lbl">Max duration</span>
            <input
              type="number"
              min={0}
              step={0.5}
              placeholder="—"
              value={maxMin}
              onChange={(e) => setMaxMin(e.target.value)}
              className="casi-v9-cp-input"
              style={{ width: 80, textAlign: 'right' }}
            />
          </div>
          <div className="casi-v9-cp-row">
            <span className="casi-v9-cp-lbl">Free tier</span>
            <button
              type="button"
              onClick={() => {
                if (beamFree) {
                  // Coming back from free → restore whatever the streamer
                  // last had pre-free. Falls back to '1' across the board
                  // only when no snapshot exists (e.g. the slot was
                  // already free in the DB at load time).
                  const prev = preFreeRatesRef.current;
                  setRateUsd(prev?.usd ?? '1');
                  setRateEur(prev?.eur ?? '1');
                  setRateUsdc(prev?.usdc ?? '1');
                  preFreeRatesRef.current = null;
                } else {
                  // Going free → snapshot current rates so un-toggling
                  // restores them, then zero everything.
                  preFreeRatesRef.current = { usd: rateUsd, eur: rateEur, usdc: rateUsdc };
                  setRateUsd('0');
                  setRateEur('0');
                  setRateUsdc('0');
                }
              }}
              className={`casi-v9-shape-b${beamFree ? ' casi-v9-on' : ''}`}
              style={{
                background: beamFree ? '#4ade80' : undefined,
                borderColor: beamFree ? '#4ade80' : undefined,
                color: beamFree ? 'var(--paper)' : undefined,
              }}
            >
              {beamFree ? '★ Free' : '★ Make free'}
            </button>
          </div>
          <button
            type="button"
            onClick={saveRates}
            className="casi-v9-cp-done"
            style={{
              background: beamFree ? '#4ade80' : 'var(--ink)',
              color: beamFree ? 'var(--paper)' : 'var(--on-ink)',
              borderColor: beamFree ? '#4ade80' : 'var(--ink)',
              fontWeight: 700,
            }}
          >
            Save pricing
          </button>
        </div>
      )}

      {/* Behavior — glow + lock + active strip */}
      {tab === 'behavior' && (
        <div className="casi-v9-cp-pane">
          {onUpdateGlow && (
            <div className="casi-v9-cp-row">
              <span className="casi-v9-cp-lbl">Glow on start</span>
              <button
                type="button"
                onClick={() => onUpdateGlow(el.id, !glowOn)}
                className={`casi-v9-shape-b${glowOn ? ' casi-v9-on' : ''}`}
              >
                {glowOn ? '✦ On' : '○ Off'}
              </button>
            </div>
          )}
          <div className="casi-v9-cp-row">
            <span className="casi-v9-cp-lbl">Lock position</span>
            <button
              type="button"
              onClick={() => toggleLock(el.id, !el.locked)}
              className={`casi-v9-shape-b${el.locked ? ' casi-v9-on' : ''}`}
              style={
                el.locked
                  ? { background: '#f87171', borderColor: '#f87171', color: 'var(--paper)' }
                  : undefined
              }
            >
              {el.locked ? '🔒 Locked' : '🔓 Unlocked'}
            </button>
          </div>
        </div>
      )}

      <hr className="casi-v9-cp-sep" />

      <button type="button" onClick={onDone} className="casi-v9-cp-done">
        Done
      </button>
      <button type="button" onClick={() => deleteLayer(el.id)} className="casi-v9-cp-del">
        Delete slot
      </button>

      {/* Active booking strip — stays below the tabs as a status row. */}
      {activeBooking && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--ink-04)',
            border: '1px solid var(--ink-22)',
            padding: '10px 12px',
            flexWrap: 'wrap',
            marginTop: 4,
          }}
        >
          {activeBooking.image_url && (
            <div style={{ width: 24, height: 24, overflow: 'hidden', flexShrink: 0 }}>
              <SlotMedia
                src={activeBooking.image_url}
                fileType={activeBooking.file_type}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          )}
          <span
            style={{
              fontFamily: 'var(--B)',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--ink)',
            }}
          >
            ● {activeBooking.viewer_name}
          </span>
          <span style={{ fontFamily: 'var(--M)', fontSize: 10, color: 'var(--text-4)' }}>
            {formatTime(liveSeconds)} left
          </span>
          {earnedSoFar && (
            <span style={{ fontFamily: 'var(--M)', fontSize: 10, color: '#4ade80' }}>
              ${earnedSoFar} earned
            </span>
          )}
          <button
            type="button"
            onClick={() => kickBeam(activeBooking)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'rgba(248,113,113,0.7)',
              fontFamily: 'var(--M)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            End early
          </button>
        </div>
      )}
    </div>
  );
}
