/**
 * SVG path helpers for annular wedge segments and partial nest arcs.
 *
 * Angle convention: 0° = north, clockwise positive (combat HUD).
 * Nested rings use partial arcs anchored to a parent wedge mid-angle —
 * they do NOT fill a full 360° unless the option count needs the max span.
 */

/** Defaults for nested / leaf arcs (Action options, spells, Use Item, BA/R). */
export const ARC_DEFAULTS = Object.freeze({
  /** Cap total arc span so a large list stays readable and leaves a gap. */
  maxSpanDeg: 200,
  /** Preferred wedge width when there is room. */
  idealSegmentDeg: 34,
  /** Floor so tiny counts stay clickable. */
  minSegmentDeg: 20,
  /** Gap between neighboring segments. */
  gapDeg: 2.5
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
 * Partial arc of `count` equal wedges centered on `midAngle`.
 * Span grows with count up to `maxSpanDeg`, always leaving an empty gap when below 360°.
 *
 * @param {number} count
 * @param {object} [opts]
 * @param {number} [opts.midAngle=0] Arc center (0 = north)
 * @param {number} [opts.maxSpanDeg]
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

  const gapTotal = gapDeg * Math.max(count - 1, 0);
  let span = Math.min(maxSpanDeg, count * idealSegmentDeg);
  span = Math.max(span, Math.min(maxSpanDeg, count * minSegmentDeg + gapTotal));

  // Compress if min widths would exceed max span
  const minNeeded = count * minSegmentDeg + gapTotal;
  if (minNeeded > maxSpanDeg) span = maxSpanDeg;

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
 * Arc centered on a parent wedge (nests fan over the hovered parent).
 * Child max span is capped and also nudged not to wildly exceed the parent wedge.
 *
 * @param {number} count
 * @param {number} parentStart
 * @param {number} parentEnd  (may be < start if crossing 0°)
 * @param {object} [opts]
 */
export function arcSegmentsForParent(count, parentStart, parentEnd, opts = {}) {
  const mid = normalizeMid(parentStart, parentEnd);
  const parentSpan = parentSweep(parentStart, parentEnd);
  // Allow child arc to be a bit wider than the parent for readability, but keep a gap.
  const maxSpanDeg = Math.min(
    opts.maxSpanDeg ?? ARC_DEFAULTS.maxSpanDeg,
    Math.max(parentSpan + 40, 90),
    ARC_DEFAULTS.maxSpanDeg
  );
  return arcSegments(count, { ...opts, midAngle: mid, maxSpanDeg });
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

