import { useEffect, useState } from 'react';
import SlotMedia from '@/components/SlotMedia';
import { SHAPE_OPTIONS } from '@/lib/banner';
import { formatTime, getSecondsRemaining } from './time';

type Tab = 'properties' | 'pricing' | 'behavior';

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
}) {
  const [tab, setTab] = useState<Tab>('properties');
  const [editPrice, setEditPrice] = useState(String(el.price_value || 0));
  const [editUnit, setEditUnit] = useState(el.price_unit || 'min');
  const [liveSeconds, setLiveSeconds] = useState(
    activeBooking ? getSecondsRemaining(activeBooking) : 0,
  );

  // Sync price + reset to Properties when a different element is selected
  useEffect(() => {
    setEditPrice(String(el.price_value || 0));
    setEditUnit(el.price_unit || 'min');
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

  const beamFree = parseFloat(editPrice) === 0;
  const glowOn = el.glow_on_start ?? true;

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

      {/* Pricing — price input + free toggle + Save */}
      {tab === 'pricing' && (
        <div className="casi-v9-cp-pane">
          <div className="casi-v9-cp-lbl">Rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                color: beamFree ? '#4ade80' : 'var(--ink)',
                fontWeight: 800,
                fontSize: 14,
                fontFamily: 'var(--M)',
              }}
            >
              $
            </span>
            <input
              type="number"
              min={0}
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              className="casi-v9-cp-input"
              style={{ width: 76, textAlign: 'center' }}
            />
            <select
              value={editUnit}
              onChange={(e) => setEditUnit(e.target.value)}
              disabled={beamFree}
              className="casi-v9-cp-input"
              style={{ width: 'auto', cursor: beamFree ? 'not-allowed' : 'pointer', opacity: beamFree ? 0.4 : 1 }}
            >
              <option value="min">/min</option>
              <option value="hr">/hr</option>
            </select>
          </div>
          <div className="casi-v9-cp-row">
            <span className="casi-v9-cp-lbl">Free tier</span>
            <button
              type="button"
              onClick={() => setEditPrice(beamFree ? '1' : '0')}
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
            onClick={() =>
              updateLayer(el.id, {
                price_value: parseFloat(editPrice) || 0,
                price_unit: editUnit,
              })
            }
            className="casi-v9-cp-done"
            style={{
              background: beamFree ? '#4ade80' : 'var(--ink)',
              color: beamFree ? 'var(--paper)' : 'var(--on-ink)',
              borderColor: beamFree ? '#4ade80' : 'var(--ink)',
              fontWeight: 700,
            }}
          >
            Save rate
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
