import { useEffect, useState } from 'react';
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
}) {
  return (
    <div className="casi-v9-rail-row">
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
        onChange={(e) => onChange(e.target.value)}
        className="casi-v9-rail-input"
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
  displayCurrency = 'usd',
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
  /** Streamer's chosen display currency. Picks which Stripe rate row
   *  renders (USD or EUR) so we don't show all four currencies at once.
   *  USDC is always shown since it's the on-chain rail. SOL is never
   *  shown — CASI prices in USDC, SOL is fee-only. */
  displayCurrency?: 'eur' | 'usd' | 'usdc';
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
  const [cooldown, setCooldown] = useState<string>(
    String(el.prices?.cooldown_secs ?? el.cooldown_secs ?? 0),
  );
  const [liveSeconds, setLiveSeconds] = useState(
    activeBooking ? getSecondsRemaining(activeBooking) : 0,
  );

  // Sync editor state + reset to Properties when a different element is selected
  useEffect(() => {
    const fb = String(el.price_value ?? 0);
    setRateUsd(String(el.prices?.usd ?? fb));
    setRateEur(String(el.prices?.eur ?? fb));
    setRateUsdc(String(el.prices?.usdc ?? fb));
    setEditUnit(el.price_unit || 'min');
    setMinMin(String(el.prices?.min_min ?? el.min_duration_minutes ?? ''));
    setMaxMin(String(el.prices?.max_min ?? el.max_duration_minutes ?? ''));
    setCooldown(String(el.prices?.cooldown_secs ?? el.cooldown_secs ?? 0));
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

  // "Free" mode = the USD rail is 0 (the legacy price_value mirrors the USD
  // rail since most production streamers configure in dollars).
  const beamFree = parseFloat(rateUsd) === 0;
  const glowOn = el.glow_on_start ?? true;

  const saveRates = () => {
    const num = (s: string) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };
    const minN = num(minMin);
    const maxN = num(maxMin);
    const cdN = parseInt(cooldown, 10);
    const prices = {
      usd: num(rateUsd),
      eur: num(rateEur),
      usdc: num(rateUsdc),
      min_min: minN,
      max_min: maxN,
      cooldown_secs: Number.isFinite(cdN) ? cdN : 0,
    };
    // Strip null keys so the JSONB stays compact and `?? fallback` reads
    // cleanly on the load side.
    const compact = Object.fromEntries(
      Object.entries(prices).filter(([, v]) => v !== null && v !== undefined),
    );
    updateLayer(el.id, {
      // Legacy column the booking flow still reads — track the USD rail.
      price_value: num(rateUsd) ?? 0,
      price_unit: editUnit,
      prices: compact,
      min_duration_minutes: minN,
      max_duration_minutes: maxN,
      cooldown_secs: Number.isFinite(cdN) ? cdN : 0,
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

      {/* Pricing — per-rail rates + min/max duration + cooldown */}
      {tab === 'pricing' && (
        <div className="casi-v9-cp-pane">
          <div className="casi-v9-cp-lbl">Per-rail rates</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Stripe rail — single row in the streamer's chosen display
                currency. EUR-based streamer gets one EUR row; everyone else
                gets a USD row. (display_currency='usdc' falls back to USD
                for fiat tipping; the on-chain rail below covers crypto.) */}
            {displayCurrency === 'eur' ? (
              <RailRow
                glyph={<span style={{ color: 'var(--ink)' }}>€</span>}
                name="EUR"
                sub="via Stripe"
                value={rateEur}
                onChange={setRateEur}
                unit={editUnit}
                step={1}
              />
            ) : (
              <RailRow
                glyph={<span style={{ color: 'var(--ink)' }}>$</span>}
                name="USD"
                sub="via Stripe"
                value={rateUsd}
                onChange={setRateUsd}
                unit={editUnit}
                step={1}
              />
            )}
            <RailRow
              glyph={<UsdcIcon size={14} />}
              name="USDC"
              sub="on-chain · Solana"
              value={rateUsdc}
              onChange={setRateUsdc}
              unit={editUnit}
              step={0.5}
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
            <span className="casi-v9-cp-lbl">Cooldown</span>
            <input
              type="number"
              min={0}
              step={1}
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
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
                  setRateUsd('1');
                  setRateEur('1');
                  setRateUsdc('1');
                } else {
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
