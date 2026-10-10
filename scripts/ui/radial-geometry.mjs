/**
 * SVG path helpers for annular wedge segments and nest arcs.
 *
 * Angle convention: 0° = north, clockwise positive (combat HUD).
 * An opened ring is centered on its parent wedge.
 * Ten or more options use the whole circle. Fewer than ten use a half circle.
 * A single option uses a quarter circle.
 */

/** Option count below this opens a half circle. Ten or more use the whole circle. */
export const NEST_FULL_CIRCLE_AFTER = 10;

/** Defaults for nested / leaf arcs (Action options, spells, Use Item, BA/R). */
export const ARC_DEFAULTS = Object.freeze({
  /** Fallback cap when a caller does not use the half / full nest rule. */
  maxSpanDeg: 300,
  /** Preferred wedge width when there is room. */
  idealSegmentDeg: 42,
  /** Floor so a crowded ring still has a readable slice. */
  minSegmentDeg: 26,
  /** Gap between neighboring segments. */
  gapDeg: 3
});

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} innerR
 * @param {number} outerR
 * @param {number} startAngle deg
 * @param {number} endAngle deg
 * @returns {string}
 */
export function donutWedgePath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
  const sweep = endAngle - startAngle;
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  // Clockwise in our HUD angles → SVG sweep-flag 1 with our toRad mapping
  const sweepFlag = 1;

  const x0 = cx + outerR * Math.cos(toRad(startAngle));
  const y0 = cy + outerR * Math.sin(toRad(startAngle));
  const x1 = cx + outerR * Math.cos(toRad(endAngle));
  const y1 = cy + outerR * Math.sin(toRad(endAngle));
  const x2 = cx + innerR * Math.cos(toRad(endAngle));
  const y2 = cy + innerR * Math.sin(toRad(endAngle));
  const x3 = cx + innerR * Math.cos(toRad(startAngle));
  const y3 = cy + innerR * Math.sin(toRad(startAngle));

  return [
    `M ${x0} ${y0}`,
    `A ${outerR} ${outerR} 0 ${largeArc} ${sweepFlag} ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x3} ${y3}`,
    "Z"
  ].join(" ");
}

/**
 * Mid-angle point between two radii.
 */
export function wedgeAnchor(cx, cy, r, startAngle, endAngle) {
  const mid = (startAngle + endAngle) / 2;
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(toRad(mid)),
    y: cy + r * Math.sin(toRad(mid)),
    angle: mid
  };
}

/**
 * Full-circle equal segments (legacy / tests). Prefer {@link arcSegments} for nests.
 * @param {number} count
 * @param {number} [gapDeg=2]
 * @param {number} [startDeg=0]
 */
export function equalSegments(count, gapDeg = 2, startDeg = 0) {
  if (count <= 0) return [];
  const sweep = 360 / count;
  const usable = Math.max(sweep - gapDeg, sweep * 0.7);
  const pad = (sweep - usable) / 2;
  return Array.from({ length: count }, (_, i) => {
    const base = startDeg + i * sweep;
    return {
      index: i,
      start: base + pad,
      end: base + pad + usable
    };
  });
}

/**
 * Opened rings: ten or more options fill the circle. Fewer than ten use a half circle.
 * One option uses a quarter circle.
 * @param {number} count
 * @returns {number}
 */
export function nestSpanDeg(count) {
  if (count <= 1) return 90;
  return count >= NEST_FULL_CIRCLE_AFTER ? 360 : 180;
}

/**
 * Partial arc of `count` equal wedges centered on `midAngle`.
 * Span grows with count up to `maxSpanDeg`, unless `fixedSpanDeg` sets it.
 *
 * @param {number} count
 * @param {object} [opts]
 * @param {number} [opts.midAngle=0] Arc center (0 = north)
 * @param {number} [opts.maxSpanDeg]
 * @param {number} [opts.fixedSpanDeg] Use this span instead of growing toward the cap
 * @param {number} [opts.idealSegmentDeg]
 * @param {number} [opts.minSegmentDeg]
 * @param {number} [opts.gapDeg]
 * @returns {Array<{ index: number, start: number, end: number, mid: number }>}
 */
export function arcSegments(count, opts = {}) {
  if (count <= 0) return [];

  const maxSpanDeg = opts.maxSpanDeg ?? ARC_DEFAULTS.maxSpanDeg;
  const idealSegmentDeg = opts.idealSegmentDeg ?? ARC_DEFAULTS.idealSegmentDeg;
  const minSegmentDeg = opts.minSegmentDeg ?? ARC_DEFAULTS.minSegmentDeg;
  const gapDeg = opts.gapDeg ?? ARC_DEFAULTS.gapDeg;
  const midAngle = opts.midAngle ?? 0;

  const openGaps = gapDeg * Math.max(count - 1, 0);
  let span;
  if (Number.isFinite(opts.fixedSpanDeg)) {
    span = opts.fixedSpanDeg;
  } else {
    span = Math.min(maxSpanDeg, count * idealSegmentDeg);
    span = Math.max(span, Math.min(maxSpanDeg, count * minSegmentDeg + openGaps));
    const minNeeded = count * minSegmentDeg + openGaps;
    if (minNeeded > maxSpanDeg) span = maxSpanDeg;
  }

  // A full ring also needs a gap where the last wedge meets the first.
  const closes = span >= 360 - 0.01;
  const gapTotal = closes ? gapDeg * count : openGaps;
  const usable = Math.max(span - gapTotal, count * 4);
  const segSweep = usable / count;
  const start = midAngle - span / 2;

  return Array.from({ length: count }, (_, i) => {
    const s = start + i * (segSweep + gapDeg);
    const e = s + segSweep;
    return {
      index: i,
      start: s,
      end: e,
      mid: (s + e) / 2
    };
  });
}

/**
 * Arc centered on a parent wedge.
 * Ten or more options use the whole circle. Fewer than ten use a half circle.
 * One option uses a quarter circle.
 *
 * @param {number} count
 * @param {number} parentStart
 * @param {number} parentEnd  (may be < start if crossing 0°)
 * @param {object} [opts]
 */
export function arcSegmentsForParent(count, parentStart, parentEnd, opts = {}) {
  const mid = normalizeMid(parentStart, parentEnd);
  const fixedSpanDeg = nestSpanDeg(count);
  return arcSegments(count, { ...opts, midAngle: mid, fixedSpanDeg, maxSpanDeg: fixedSpanDeg });
}

/**
 * Same arc as equal wedges, but longer titles take a wider slice.
 * Short names keep a minimum so they stay tappable.
 * @param {string[]} labels
 * @param {object} [opts]
 * @param {number} [opts.midAngle=0]
 * @param {number} [opts.fixedSpanDeg]
 * @param {number} [opts.gapDeg]
 * @returns {Array<{ index: number, start: number, end: number, mid: number }>}
 */
export function weightedArcSegments(labels, opts = {}) {
  const names = Array.isArray(labels) ? labels : [];
  const count = names.length;
  if (count <= 0) return [];

  const gapDeg = opts.gapDeg ?? ARC_DEFAULTS.gapDeg;
  const midAngle = opts.midAngle ?? 0;
  const span = Number.isFinite(opts.fixedSpanDeg) ? opts.fixedSpanDeg : nestSpanDeg(count);
  const closes = span >= 360 - 0.01;
  const gapTotal = closes ? gapDeg * count : gapDeg * Math.max(count - 1, 0);
  const usable = Math.max(span - gapTotal, count * 8);
  const weights = names.map(label => {
    const len = String(label ?? "").trim().length;
    return Math.max(5, Math.min(len || 5, 32));
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = midAngle - span / 2;

  return weights.map((weight, index) => {
    const segSweep = usable * (weight / total);
    const start = cursor;
    const end = cursor + segSweep;
    cursor = end + gapDeg;
    return { index, start, end, mid: (start + end) / 2 };
  });
}

/**
 * Shift an arc so one wedge's midpoint sits on the parent midpoint.
 * Neighboring wedges stay in order, clockwise.
 * @param {Array<{ index: number, start: number, end: number, mid: number }>} segs
 * @param {number} index
 * @param {number} parentStart
 * @param {number} parentEnd
 */
export function centerArcOnIndex(segs, index, parentStart, parentEnd) {
  if (!segs?.length) return segs ?? [];
  const i = Math.max(0, Math.min(index, segs.length - 1));
  const delta = normalizeMid(parentStart, parentEnd) - segs[i].mid;
  if (!delta) return segs;
  return segs.map(seg => ({
    ...seg,
    start: seg.start + delta,
    end: seg.end + delta,
    mid: seg.mid + delta
  }));
}

/**
 * Main wedges (compact 4-way split): Action, Checks, Bonus Action, Reaction.
 * Action stays on top (crosses 0° / north).
 */
export function mainSectionAngles() {
  return [
    { id: "action", start: 315, end: 45 },     // crosses 0° — top
    { id: "checks", start: 45, end: 135 },
    { id: "bonus", start: 135, end: 225 },
    { id: "reaction", start: 225, end: 315 }
  ];
}

export function mainSectionById(id) {
  return mainSectionAngles().find(s => s.id === id) ?? null;
}

export function normalizeMid(start, end) {
  if (end < start) {
    const mid = (start + end + 360) / 2;
    return ((mid % 360) + 360) % 360;
  }
  return (start + end) / 2;
}

function parentSweep(start, end) {
  if (end < start) return end + 360 - start;
  return end - start;
}

/**
 * Special-case path for wedges that cross the 0° seam.
 */
export function sectionWedgePath(cx, cy, innerR, outerR, start, end) {
  if (end < start) {
    return donutWedgePath(cx, cy, innerR, outerR, start, end + 360);
  }
  return donutWedgePath(cx, cy, innerR, outerR, start, end);
}

export function sectionAnchor(cx, cy, r, start, end) {
  if (end < start) {
    const mid = normalizeMid(start, end);
    const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(toRad(mid)),
      y: cy + r * Math.sin(toRad(mid)),
      angle: mid
    };
  }
  return wedgeAnchor(cx, cy, r, start, end);
}

/**
 * Square frame for a cover/slice image that fully covers an annular wedge.
 * Centered on mid-radius / mid-angle; sized from outer chord + radial depth.
 *
 * @returns {{ x: number, y: number, width: number, height: number, cx: number, cy: number }}
 */
export function wedgeImageFrame(cx, cy, innerR, outerR, startDeg, endDeg) {
  const midR = (innerR + outerR) / 2;
  const depth = Math.max(outerR - innerR, 8);
  const sweep = parentSweep(startDeg, endDeg);
  const halfRad = (Math.min(Math.abs(sweep), 180) * Math.PI) / 360;
  const chord = 2 * outerR * Math.sin(halfRad);
  const size = Math.max(depth * 1.55, chord * 1.15, 28);
  const anchor = sectionAnchor(cx, cy, midR, startDeg, endDeg);
  return {
    x: anchor.x - size / 2,
    y: anchor.y - size / 2,
    width: size,
    height: size,
    cx: anchor.x,
    cy: anchor.y
  };
}

