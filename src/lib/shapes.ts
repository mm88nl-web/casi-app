/**
 * SVG shape presets for the "custom" slot shape.
 * Each path is in objectBoundingBox coordinate space (0–1).
 * Used by ShapePresetsPanel in /studio/live and rendered via
 * <clipPath clipPathUnits="objectBoundingBox"> on both the viewer
 * overlay (/overlay, /obs) and the studio canvas.
 */
export const SHAPE_PRESETS = [
  { id: 'heart',    label: 'Heart',     path: 'M 0.5 0.9 C 0.25 0.7 0.05 0.55 0.05 0.38 C 0.05 0.18 0.2 0.08 0.35 0.08 C 0.43 0.08 0.48 0.13 0.5 0.2 C 0.52 0.13 0.57 0.08 0.65 0.08 C 0.8 0.08 0.95 0.18 0.95 0.38 C 0.95 0.55 0.75 0.7 0.5 0.9 Z' },
  { id: 'star5',    label: 'Star',      path: 'M 0.5 0.05 L 0.61 0.38 L 0.96 0.38 L 0.67 0.59 L 0.79 0.92 L 0.5 0.7 L 0.21 0.92 L 0.33 0.59 L 0.04 0.38 L 0.39 0.38 Z' },
  { id: 'star4',    label: '4-Star',    path: 'M 0.5 0 L 0.6 0.4 L 1 0.5 L 0.6 0.6 L 0.5 1 L 0.4 0.6 L 0 0.5 L 0.4 0.4 Z' },
  { id: 'diamond',  label: 'Diamond',   path: 'M 0.5 0 L 1 0.5 L 0.5 1 L 0 0.5 Z' },
  { id: 'triangle', label: 'Triangle',  path: 'M 0.5 0 L 1 1 L 0 1 Z' },
  { id: 'pentagon', label: 'Pentagon',  path: 'M 0.5 0 L 0.98 0.36 L 0.79 0.95 L 0.21 0.95 L 0.02 0.36 Z' },
  { id: 'hexagon',  label: 'Hexagon',   path: 'M 0.25 0 L 0.75 0 L 1 0.5 L 0.75 1 L 0.25 1 L 0 0.5 Z' },
  { id: 'octagon',  label: 'Octagon',   path: 'M 0.29 0 L 0.71 0 L 1 0.29 L 1 0.71 L 0.71 1 L 0.29 1 L 0 0.71 L 0 0.29 Z' },
  { id: 'shield',   label: 'Shield',    path: 'M 0.5 0 L 0.95 0.18 L 0.95 0.55 C 0.95 0.78 0.75 0.92 0.5 1 C 0.25 0.92 0.05 0.78 0.05 0.55 L 0.05 0.18 Z' },
  { id: 'crown',    label: 'Crown',     path: 'M 0 0.9 L 0 0.25 L 0.25 0.55 L 0.5 0.08 L 0.75 0.55 L 1 0.25 L 1 0.9 Z' },
  { id: 'arrow',    label: 'Arrow',     path: 'M 0 0.2 L 0.55 0.2 L 0.55 0 L 1 0.5 L 0.55 1 L 0.55 0.8 L 0 0.8 Z' },
  { id: 'speech',   label: 'Bubble',    path: 'M 0.1 0 L 0.9 0 C 0.96 0 1 0.06 1 0.13 L 1 0.62 C 1 0.69 0.96 0.75 0.9 0.75 L 0.45 0.75 L 0.2 1 L 0.2 0.75 L 0.1 0.75 C 0.04 0.75 0 0.69 0 0.62 L 0 0.13 C 0 0.06 0.04 0 0.1 0 Z' },
  { id: 'cross',    label: 'Cross',     path: 'M 0.35 0 L 0.65 0 L 0.65 0.35 L 1 0.35 L 1 0.65 L 0.65 0.65 L 0.65 1 L 0.35 1 L 0.35 0.65 L 0 0.65 L 0 0.35 L 0.35 0.35 Z' },
  { id: 'lightning',label: 'Lightning', path: 'M 0.65 0 L 0.25 0.48 L 0.52 0.48 L 0.35 1 L 0.75 0.48 L 0.48 0.48 Z' },
  { id: 'cloud',    label: 'Cloud',     path: 'M 0.2 0.75 C 0.05 0.75 0.05 0.5 0.18 0.45 C 0.12 0.22 0.28 0.08 0.42 0.12 C 0.48 0.02 0.62 0.02 0.68 0.12 C 0.82 0.06 0.98 0.22 0.9 0.4 C 1.0 0.45 1.0 0.72 0.8 0.75 Z' },
] as const;

export type ShapePresetId = (typeof SHAPE_PRESETS)[number]['id'];
