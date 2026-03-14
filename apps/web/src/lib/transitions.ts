export type TransitionType =
  | 'cut'
  | 'fade'
  | 'dissolve'
  | 'fadeblack'
  | 'fadewhite'
  | 'wipe'
  | 'wiperight'
  | 'wipeup'
  | 'wipedown'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'smoothleft'
  | 'smoothright'
  | 'circleopen'
  | 'circleclose'
  | 'pixelize'
  | 'radial'
  | 'zoomin';

interface TransitionMeta {
  label: string;
  badgeLabel: string;
  stripLabel: string;
  color: string;
  desc: string;
}

export const TRANSITION_CYCLE: TransitionType[] = [
  'cut',
  'fade',
  'dissolve',
  'fadeblack',
  'fadewhite',
  'wipe',
  'wiperight',
  'wipeup',
  'wipedown',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'smoothleft',
  'smoothright',
  'circleopen',
  'circleclose',
  'pixelize',
  'radial',
  'zoomin',
];

export const TRANSITION_META: Record<TransitionType, TransitionMeta> = {
  cut:         { label: 'Cut',            badgeLabel: 'CUT',    stripLabel: '/',  color: '#6b7280', desc: 'Hard cut with no blend' },
  fade:        { label: 'Fade',           badgeLabel: 'FADE',   stripLabel: 'F',  color: '#3b82f6', desc: 'Classic crossfade between shots' },
  dissolve:    { label: 'Dissolve',       badgeLabel: 'DISS',   stripLabel: 'D',  color: '#10b981', desc: 'Soft dissolve blend' },
  fadeblack:   { label: 'Fade to Black',  badgeLabel: 'F BLK',  stripLabel: 'FB', color: '#111827', desc: 'Fade through black between clips' },
  fadewhite:   { label: 'Fade to White',  badgeLabel: 'F WHT',  stripLabel: 'FW', color: '#e5e7eb', desc: 'Fade through white between clips' },
  wipe:        { label: 'Wipe Left',      badgeLabel: 'WIPE L', stripLabel: 'WL', color: '#f97316', desc: 'Directional wipe from left to right' },
  wiperight:   { label: 'Wipe Right',     badgeLabel: 'WIPE R', stripLabel: 'WR', color: '#fb7185', desc: 'Directional wipe from right to left' },
  wipeup:      { label: 'Wipe Up',        badgeLabel: 'WIPE U', stripLabel: 'WU', color: '#f59e0b', desc: 'Directional wipe upward' },
  wipedown:    { label: 'Wipe Down',      badgeLabel: 'WIPE D', stripLabel: 'WD', color: '#facc15', desc: 'Directional wipe downward' },
  slideleft:   { label: 'Slide Left',     badgeLabel: 'SLD L',  stripLabel: 'SL', color: '#8b5cf6', desc: 'Next shot slides in from the right' },
  slideright:  { label: 'Slide Right',    badgeLabel: 'SLD R',  stripLabel: 'SR', color: '#a855f7', desc: 'Next shot slides in from the left' },
  slideup:     { label: 'Slide Up',       badgeLabel: 'SLD U',  stripLabel: 'SU', color: '#6366f1', desc: 'Next shot slides up into frame' },
  slidedown:   { label: 'Slide Down',     badgeLabel: 'SLD D',  stripLabel: 'SD', color: '#0ea5e9', desc: 'Next shot slides down into frame' },
  smoothleft:  { label: 'Smooth Left',    badgeLabel: 'SMTH L', stripLabel: 'ML', color: '#14b8a6', desc: 'Eased wipe moving left to right' },
  smoothright: { label: 'Smooth Right',   badgeLabel: 'SMTH R', stripLabel: 'MR', color: '#06b6d4', desc: 'Eased wipe moving right to left' },
  circleopen:  { label: 'Circle Open',    badgeLabel: 'CIRC O', stripLabel: 'CO', color: '#22c55e', desc: 'Iris opening reveal' },
  circleclose: { label: 'Circle Close',   badgeLabel: 'CIRC C', stripLabel: 'CC', color: '#84cc16', desc: 'Iris closing reveal' },
  pixelize:    { label: 'Pixelize',       badgeLabel: 'PIXEL',  stripLabel: 'PX', color: '#ef4444', desc: 'Blocky pixel dissolve' },
  radial:      { label: 'Radial',         badgeLabel: 'RADIAL', stripLabel: 'RD', color: '#ec4899', desc: 'Radial reveal around the frame' },
  zoomin:      { label: 'Zoom In',        badgeLabel: 'ZOOM',   stripLabel: 'ZI', color: '#38bdf8', desc: 'Push zoom into the next clip' },
};

export function normalizeTransitionType(value?: string | null): TransitionType {
  if (!value) return 'cut';
  if (value === 'wipeleft') return 'wipe';
  return (TRANSITION_CYCLE as string[]).includes(value) ? (value as TransitionType) : 'cut';
}
