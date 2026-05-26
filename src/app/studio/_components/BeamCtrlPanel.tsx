import { useEffect, useRef, useState } from 'react';
import SlotMedia from '@/components/SlotMedia';
import UsdcIcon from '@/components/icons/UsdcIcon';
import { getFiatConfig, fiatSymbol, stripeMinAmount, toStripeAmount } from '@/lib/currency';
import ShapePresetsPanel from './ShapePresetsPanel';
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
  onUpdateShape?: (id: string, shape: string, extra?: { corner_radius?: number; clip_path_svg?: string | null }) => void;
  onUpdateGlow?: (id: string, glow: boolean) => void;
  /** Stripe Connect's default currency (lowercase ISO-4217) for this
   *  streamer. Drives the Stripe row on the slot Pricing tab — the rate
   *  input is in whatever Stripe will actually charge in, eliminating the
   *  "rate in EUR but PI in USD" mismatch the prior free-form picker
   *  allowed. null means Stripe isn't connected; the Stripe row hides
   *  entirely and the streamer prices in USDC only. Unknown currencies
   *  fall back to a generic $ render via getFiatConfig. */
  stripeCurrency?: string | null;
}) {
  const [tab, setTab] = useState<Tab>('properties');
  // Per-rail rates — fall back to price_value when a rail isn't set on the row.
  // The legacy single price_value continues to drive the booking flow today;
  // the per-rail values are the source of truth for the studio UI and will
  // power per-rail booking once the booking flow is wired through (follow-up).
  // Stripe rail rate is keyed by the streamer's actual currency. We track
  // it under whichever ISO code Stripe Connect reports so a streamer in
  // GBP-land prices in £ without us ever round-tripping their input
  // through USD or EUR. Fallback to USD when Stripe isn't connected
  // (stripeCurrency === null) — the row hides anyway in that case.
  const fiatKey = (stripeCurrency || 'usd').toLowerCase();
  const fiatCfg = getFiatConfig(stripeCurrency);
  const fallbackFiat = String(el.price_value ?? 0);
  const [rateFiat, setRateFiat] = useState<string>(
    String(el.prices?.[fiatKey] ?? fallbackFiat),
  );
  const [rateUsdc, setRateUsdc] = useState<string>(String(el.prices?.usdc ?? fallbackFiat));
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
  const preFreeRatesRef = useRef<{ fiat: string; usdc: string } | null>(null);

  // Sync editor state + reset to Properties when a different element is selected
  useEffect(() => {
    const fb = String(el.price_value ?? 0);
    setRateFiat(String(el.prices?.[fiatKey] ?? fb));
    setRateUsdc(String(el.prices?.usdc ?? fb));
    setEditUnit(el.price_unit || 'min');
    setMinMin(String(el.prices?.min_min ?? el.min_duration_minutes ?? ''));
    setMaxMin(String(el.prices?.max_min ?? el.max_duration_minutes ?? ''));
    preFreeRatesRef.current = null;
    setTab('properties');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id, fiatKey]);

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
  // USDC isn't flagged free just because its fiat rail is empty.
  const numOr0 = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const beamFree = numOr0(rateFiat) === 0 && numOr0(rateUsdc) === 0;
  const glowOn = el.glow_on_start ?? true;

  const saveRates = () => {
    const num = (s: string) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };
    const minN = num(minMin);
    const maxN = num(maxMin);
    // Only persist the Stripe rail the streamer can actually charge in.
    // When Stripe isn't connected (stripeCurrency null) the fiat rate
    // isn't persisted — it would otherwise resurface in formatSlotPrice
    // as "$1/min" on a slot the streamer only set in USDC. USDC is always
    // persisted; the on-chain rail doesn't depend on Stripe.
    const fiatN = stripeCurrency ? num(rateFiat) : null;
    const usdcN = num(rateUsdc);
    const prices: Record<string, number | null> = {
      [fiatKey]: fiatN,
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
    const legacyPriceValue = stripeCurrency ? (num(rateFiat) ?? 0) : (usdcN ?? 0);
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

      {/* Properties — two-level slot type + shape hierarchy */}
      {tab === 'properties' && (
        <div className="casi-v9-cp-pane">
          {/* Level 1: Slot type */}
          <div className="casi-v9-cp-lbl">Slot type</div>
          {(() => {
            const slotType: 'media' | 'banner' | 'backdrop' =
              el.shape === 'banner' ? 'banner' :
              el.shape === 'backdrop' ? 'backdrop' : 'media';
            const mediaShape: string = slotType === 'media' ? (el.shape || 'rect') : 'rect';

            return (
              <>
                <div className="casi-v9-shape-btns">
                  {([
                    { type: 'media',    label: 'Image / Video', shape: 'rect'     },
                    { type: 'banner',   label: 'Banner',        shape: 'banner'   },
                    { type: 'backdrop', label: 'Backdrop',      shape: 'backdrop' },
                  ] as const).map(({ type, label, shape }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { if (slotType !== type) onUpdateShape?.(el.id, shape); }}
                      className={`casi-v9-shape-b${slotType === type ? ' casi-v9-on' : ''}`}
                    >{label}</button>
                  ))}
                </div>

                {/* Level 2: Shape (Image/Video only) */}
                {slotType === 'media' && onUpdateShape && (
                  <>
                    <div className="casi-v9-cp-lbl" style={{ marginTop: 10 }}>Shape</div>
                    <div className="casi-v9-shape-btns">
                      {([
                        { id: 'rect',   label: 'Rectangle' },
                        { id: 'circle', label: 'Circle'    },
                        { id: 'custom', label: 'Custom'    },
                      ] as const).map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onUpdateShape(el.id, id)}
                          className={`casi-v9-shape-b${mediaShape === id ? ' casi-v9-on' : ''}`}
                        >{label}</button>
                      ))}
                    </div>

                    {/* Corner radius slider (Rectangle only) */}
                    {mediaShape === 'rect' && (
                      <div className="casi-v9-cp-row" style={{ marginTop: 8 }}>
                        <span className="casi-v9-cp-lbl">Corners</span>
                        <input
                          type="range"
                          min={0}
                          max={50}
                          step={1}
                          value={el.corner_radius ?? 0}
                          onChange={(e) => updateLayer(el.id, { corner_radius: Number(e.target.value) })}
                          style={{ flex: 1, accentColor: 'var(--ink)' }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 28, textAlign: 'right', fontFamily: 'var(--M)' }}>
                          {el.corner_radius ?? 0}px
                        </span>
                      </div>
                    )}

                    {/* Preset picker (Custom only) */}
                    {mediaShape === 'custom' && (
                      <ShapePresetsPanel
                        selectedPath={el.clip_path_svg ?? null}
                        onSelect={(path) => updateLayer(el.id, { clip_path_svg: path })}
                      />
                    )}
                  </>
                )}
              </>
            );
          })()}
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
                in USDC only until Stripe is hooked up via Settings.
                Symbol + step come from getFiatConfig so a streamer in
                GBP-land gets £ with whole-pound steps, JPY-land gets ¥
                with ¥100 steps, etc. */}
            {stripeCurrency ? (
              <RailRow
                glyph={<span style={{ color: 'var(--ink)' }}>{fiatCfg.symbol}</span>}
                name={fiatKey.toUpperCase()}
                sub="via Stripe"
                value={rateFiat}
                onChange={setRateFiat}
                unit={editUnit}
                step={fiatCfg.rateStep}
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

          {/* Quiet inline hint when the per-minute rate falls below Stripe's
              currency floor — in that range, viewers ending a beam early
              get a full refund (the cancel path in /api/stripe/end-early)
              instead of a pro-rated charge. Conditional + minimal so it
              only surfaces when actually relevant. */}
          {(() => {
            if (!stripeCurrency) return null;
            const perMin = editUnit === 'hr' ? Number(rateFiat) / 60 : Number(rateFiat);
            if (!Number.isFinite(perMin) || perMin <= 0) return null;
            const perMinMinor = toStripeAmount(stripeCurrency, perMin);
            const floor = stripeMinAmount(stripeCurrency);
            if (perMinMinor >= floor) return null;
            const floorDisplay = `${fiatSymbol(stripeCurrency)}${(floor / 100).toFixed(2)}`;
            return (
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-3)',
                  padding: '2px 4px 0',
                  lineHeight: 1.5,
                  fontFamily: 'var(--B), var(--font-casi-sans), sans-serif',
                }}
              >
                End-early refunds in full when the pro-rated amount is below {floorDisplay} (Stripe minimum).
              </div>
            );
          })()}
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
                  setRateFiat(prev?.fiat ?? '1');
                  setRateUsdc(prev?.usdc ?? '1');
                  preFreeRatesRef.current = null;
                } else {
                  // Going free → snapshot current rates so un-toggling
                  // restores them, then zero everything.
                  preFreeRatesRef.current = { fiat: rateFiat, usdc: rateUsdc };
                  setRateFiat('0');
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
