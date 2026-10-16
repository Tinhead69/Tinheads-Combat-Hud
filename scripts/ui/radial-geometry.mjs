/**
 * SVG path helpers for annular wedge segments and partial nest arcs.
 *
 * Angle convention: 0° = north, clockwise positive (combat HUD).
 * Nested rings use partial arcs anchored to a parent wedge mid-angle —
 * they do NOT fill a full 360° unless the option count needs the max span.
 *
 * Nested option rings size wedges from title/label length (min/max clamped).
 * Crowded nests may grow toward {@link ARC_DEFAULTS.crowdedMaxSpanDeg}; a single
 * short leaf stays compact and never stretches to fill its parent quarter.
 */

/** Defaults for nested / leaf arcs (Action options, spells, Use Item, BA/R). */
export const ARC_DEFAULTS = Object.freeze({
  /** Soft preferred total-arc cap when titles fit comfortably. */
  maxSpanDeg: 220,
  /** Hard cap when many long titles need room — still leaves a visible gap. */
  crowdedMaxSpanDeg: 300,
  /** Preferred equal-split width when no titles are supplied (legacy). */
  idealSegmentDeg: 34,
  /** Floor so tiny / short leaves stay clickable. */
  minSegmentDeg: 18,
  /** Cap per leaf so one long title does not dominate the nest. */
  maxSegmentDeg: 52,
  /** Fixed padding in the title→angle formula (icon / margins). */
  titleBaseDeg: 14,
  /** Degrees contributed per character of title. */
  degPerChar: 2.15,
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
 * Main 3/4 economy wedges use {@link mainSectionAngles}, not this helper.
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
 * Map a title/label to a wedge sweep (degrees), clamped to min/max.
 * Short titles → narrower wedges; long titles → wider (up to max).
 *
 * @param {string} [title]
 * @param {object} [opts]
 * @returns {number}
 */
export function segmentDegForTitle(title, opts = {}) {
  const minSegmentDeg = opts.minSegmentDeg ?? ARC_DEFAULTS.minSegmentDeg;
  const maxSegmentDeg = opts.maxSegmentDeg ?? ARC_DEFAULTS.maxSegmentDeg;
  const titleBaseDeg = opts.titleBaseDeg ?? ARC_DEFAULTS.titleBaseDeg;
  const degPerChar = opts.degPerChar ?? ARC_DEFAULTS.degPerChar;
  const len = String(title ?? "").trim().length;
  const raw = titleBaseDeg + len * degPerChar;
  return Math.min(maxSegmentDeg, Math.max(minSegmentDeg, raw));
}

/**
 * Approximate how many caption characters fit in a wedge sweep
 * (used to avoid ellipsis when the leaf was widened for a long title).
 *
 * @param {number} sweepDeg
 * @param {object} [opts]
 * @param {number} [opts.degPerChar]
 * @returns {number}
 */
export function captionCharsForSweep(sweepDeg, opts = {}) {
  const degPerChar = opts.degPerChar ?? ARC_DEFAULTS.degPerChar;
  const chars = Math.floor(Math.max(0, sweepDeg) / degPerChar);
  return Math.max(4, Math.min(48, chars));
}

/**
 * Fit caption text to a wedge sweep; ellipsis only when still too long.
 *
 * @param {string} text
 * @param {number} startDeg
 * @param {number} endDeg
 * @returns {string}
 */
export function fitCaptionToSweep(text, startDeg, endDeg) {
  const raw = String(text ?? "");
  const sweep = parentSweep(startDeg, endDeg);
  const maxChars = captionCharsForSweep(sweep);
  if (raw.length <= maxChars) return raw;
  const keep = Math.max(1, maxChars - 1);
  return `${raw.slice(0, keep)}…`;
}

/**
 * Desired per-segment widths (degrees) for a nest.
 * When `titles` is provided, widths follow title length; otherwise equal ideal.
 *
 * @param {number} count
 * @param {object} [opts]
 * @param {string[]} [opts.titles]
 * @returns {number[]}
 */
export function segmentWidthsForNest(count, opts = {}) {
  if (count <= 0) return [];
  const minSegmentDeg = opts.minSegmentDeg ?? ARC_DEFAULTS.minSegmentDeg;
  const maxSegmentDeg = opts.maxSegmentDeg ?? ARC_DEFAULTS.maxSegmentDeg;
  const idealSegmentDeg = opts.idealSegmentDeg ?? ARC_DEFAULTS.idealSegmentDeg;
  const titles = Array.isArray(opts.titles) ? opts.titles : null;

  if (titles) {
    return Array.from({ length: count }, (_, i) =>
      segmentDegForTitle(titles[i] ?? "", {
        minSegmentDeg,
        maxSegmentDeg,
        titleBaseDeg: opts.titleBaseDeg,
        degPerChar: opts.degPerChar
      })
    );
  }

  return Array.from({ length: count }, () =>
    Math.min(maxSegmentDeg, Math.max(minSegmentDeg, idealSegmentDeg))
  );
}

/**
 * Scale widths to fit `usable` degrees while respecting a per-segment floor.
 * If floors cannot fit, compress equally below the floor (last resort).
 *
 * @param {number[]} widths
 * @param {number} usable
 * @param {number} minDeg
 * @returns {number[]}
 */
function fitWidthsToUsable(widths, usable, minDeg) {
  const n = widths.length;
  if (n === 0) return [];
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum <= 0) return widths.map(() => usable / n);
  if (Math.abs(sum - usable) < 0.01) return widths.slice();

  let scaled = widths.map(w => (w / sum) * usable);
  const floorTotal = n * minDeg;
  if (floorTotal > usable + 0.01) {
    // Cannot honor min — equal compress
    return scaled.map(() => usable / n);
  }

  // Raise floors, then redistribute leftover proportionally among the rest
  const locked = scaled.map(w => w < minDeg);
  let lockedSum = 0;
  let freeSum = 0;
  for (let i = 0; i < n; i++) {
    if (locked[i]) lockedSum += minDeg;
    else freeSum += scaled[i];
  }
  const freeBudget = usable - lockedSum;
  return scaled.map((w, i) => {
    if (locked[i]) return minDeg;
    if (freeSum <= 0) return freeBudget / Math.max(1, n - locked.filter(Boolean).length);
    return (w / freeSum) * freeBudget;
  });
}

/**
 * Partial arc of wedges centered on `midAngle`.
 * With `opts.titles`, widths follow title length (min/max clamped). Without titles,
 * equal ideal widths. Span is the natural sum of widths + gaps — never stretched
 * to fill a parent quarter. When that sum exceeds the soft max, the arc grows
 * toward `crowdedMaxSpanDeg` so labels stay readable.
 *
 * @param {number} count
 * @param {object} [opts]
 * @param {number} [opts.midAngle=0] Arc center (0 = north)
 * @param {string[]} [opts.titles] Per-segment labels for title-based sizing
 * @param {number} [opts.maxSpanDeg] Soft preferred cap
 * @param {number} [opts.crowdedMaxSpanDeg] Hard cap when titles need more room
 * @param {number} [opts.idealSegmentDeg]
 * @param {number} [opts.minSegmentDeg]
 * @param {number} [opts.maxSegmentDeg]
 * @param {number} [opts.gapDeg]
 * @returns {Array<{ index: number, start: number, end: number, mid: number }>}
 */
export function arcSegments(count, opts = {}) {
  if (count <= 0) return [];

  const softMax = opts.maxSpanDeg ?? ARC_DEFAULTS.maxSpanDeg;
  const hardMax = Math.min(
    opts.crowdedMaxSpanDeg ?? ARC_DEFAULTS.crowdedMaxSpanDeg,
    360 - 12
  );
  const minSegmentDeg = opts.minSegmentDeg ?? ARC_DEFAULTS.minSegmentDeg;
  const gapDeg = opts.gapDeg ?? ARC_DEFAULTS.gapDeg;
  const midAngle = opts.midAngle ?? 0;

  const gapTotal = gapDeg * Math.max(count - 1, 0);
  let widths = segmentWidthsForNest(count, opts);
  let needed = widths.reduce((a, b) => a + b, 0) + gapTotal;

  // Grow toward hard max when soft max is too tight for titles / count
  const spanCap = needed <= softMax ? softMax : Math.max(softMax, hardMax);
  let span;
  if (needed <= spanCap) {
    // Natural size — leave empty gap; do not stretch to fill softMax
    span = needed;
  } else {
    span = spanCap;
    const usable = Math.max(span - gapTotal, count * 4);
    widths = fitWidthsToUsable(widths, usable, minSegmentDeg);
    needed = widths.reduce((a, b) => a + b, 0) + gapTotal;
    span = Math.min(spanCap, needed);
  }

  const start = midAngle - span / 2;
  let cursor = start;
  return widths.map((w, i) => {
    const s = cursor;
    const e = s + w;
    cursor = e + (i < count - 1 ? gapDeg : 0);
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
 * Child arcs stay anchored on the parent mid-angle; total span may grow well
 * past the parent wedge when titles need room (up to crowdedMaxSpanDeg).
 *
 * @param {number} count
 * @param {number} parentStart
 * @param {number} parentEnd  (may be < start if crossing 0°)
 * @param {object} [opts]
 * @param {string[]} [opts.titles]
 */
export function arcSegmentsForParent(count, parentStart, parentEnd, opts = {}) {
  const mid = normalizeMid(parentStart, parentEnd);
  const softCap = opts.maxSpanDeg ?? ARC_DEFAULTS.maxSpanDeg;
  const hardCap = opts.crowdedMaxSpanDeg ?? ARC_DEFAULTS.crowdedMaxSpanDeg;
  return arcSegments(count, {
    ...opts,
    midAngle: mid,
    maxSpanDeg: softCap,
    crowdedMaxSpanDeg: hardCap
  });
}

/**
 * Main wedges by HUD profile.
 * - character: Action / Checks / Bonus / Reaction (4-way)
 * - monster: Action / Bonus / Reaction only (3-way; no Checks)
 * Action stays on top (crosses 0° / north).
 *
 * @param {"character"|"monster"} [profile]
 */
export function mainSectionAngles(profile = "character") {
  if (profile === "monster") {
    return [
      { id: "action", start: 300, end: 60 },   // 120° top
      { id: "bonus", start: 60, end: 180 },
      { id: "reaction", start: 180, end: 300 }
    ];
  }
  return [
    { id: "action", start: 315, end: 45 },     // crosses 0° — top
    { id: "checks", start: 45, end: 135 },
    { id: "bonus", start: 135, end: 225 },
    { id: "reaction", start: 225, end: 315 }
  ];
}

export function mainSectionById(id, profile = "character") {
  return mainSectionAngles(profile).find(s => s.id === id) ?? null;
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
