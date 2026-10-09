/**
 * Partial-arc geometry checks.
 * Run: node scripts/tests/arc-segments.test.mjs
 */

import {
  ARC_DEFAULTS,
  arcSegments,
  arcSegmentsForParent,
  centerArcOnIndex,
  mainSectionById,
  nestSpanDeg,
  normalizeMid
} from "../ui/radial-geometry.mjs";

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

{
  const segs = arcSegments(3, { midAngle: 0 });
  assert(segs.length === 3, "3 segments");
  const span = segs[2].end - segs[0].start;
  assert(span < 360, "does not fill full circle");
  assert(span <= ARC_DEFAULTS.maxSpanDeg + 0.01, "respects max span");
  const mid = (segs[0].start + segs[2].end) / 2;
  assert(Math.abs(mid) < 1 || Math.abs(mid - 0) < 1, "centered near midAngle 0");
}

{
  const segs = arcSegments(1, { midAngle: 90 });
  assert(segs.length === 1, "single segment");
  assert(segs[0].mid > 80 && segs[0].mid < 100, "single segment near 90");
  assert(segs[0].end - segs[0].start < 50, "few items stay compact");
}

{
  const many = arcSegments(12, { midAngle: 0, maxSpanDeg: 200 });
  const span = many[many.length - 1].end - many[0].start;
  assert(span <= 200.01, "large counts cap at maxSpan");
  assert(span < 360, "still leaves a gap");
}

{
  const action = mainSectionById("action");
  const segs = arcSegmentsForParent(5, action.start, action.end);
  const mid = normalizeMid(action.start, action.end);
  assert(Math.abs(((segs[0].start + segs[4].end) / 2) - mid) < 2, "action nest fans over Action wedge");
}

{
  const action = mainSectionById("action");
  const segs = arcSegmentsForParent(12, action.start, action.end);
  const span = segs[11].end - segs[0].start;
  const closingGap = segs[0].start + 360 - segs[11].end;
  assert(Math.abs(span + closingGap - 360) < 1, "more than 10 options use the whole circle");
  assert(Math.abs(closingGap - ARC_DEFAULTS.gapDeg) < 0.05, "a full circle keeps a gap between the first and last wedge");
  assert(nestSpanDeg(11) === 360 && nestSpanDeg(10) === 360 && nestSpanDeg(9) === 180, "full circle from 10 options, half circle below that");
}

{
  const action = mainSectionById("action");
  const segs = arcSegmentsForParent(6, action.start, action.end);
  const span = segs[5].end - segs[0].start;
  const mid = normalizeMid(action.start, action.end);
  assert(Math.abs(span - 180) < 1, "fewer than 10 options use a half circle");
  assert(Math.abs(((segs[0].start + segs[5].end) / 2) - mid) < 2, "half circle stays centered on the parent");
}

{
  const action = mainSectionById("action");
  const segs = arcSegmentsForParent(10, action.start, action.end, { maxSpanDeg: 280 });
  const centered = centerArcOnIndex(segs, 4, action.start, action.end);
  const north = normalizeMid(action.start, action.end);
  assert(Math.abs(centered[4].mid - north) < 0.01, "Attack wedge sits on the Action midpoint");
  assert(centered[5].mid > centered[4].mid, "the next wedge is clockwise of Attack");
  assert(centered[5].start >= centered[4].end - 0.01, "Cast Spell stays beside Attack");
  const seam = centered[0].start + 360 - centered[9].end;
  assert(Math.abs(seam - ARC_DEFAULTS.gapDeg) < 0.05, "Dodge and Use Item keep a gap where the ring closes");
}

console.log(`\n${passed} assertions passed`);
