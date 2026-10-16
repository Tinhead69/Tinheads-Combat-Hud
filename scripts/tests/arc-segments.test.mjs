/**
 * Partial-arc + title-based wedge geometry checks.
 * Run: node scripts/tests/arc-segments.test.mjs
 */

import {
  ARC_DEFAULTS,
  arcSegments,
  arcSegmentsForParent,
  captionCharsForSweep,
  fitCaptionToSweep,
  mainSectionById,
  normalizeMid,
  segmentDegForTitle
} from "../ui/radial-geometry.mjs";

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

function spanOf(segs) {
  return segs[segs.length - 1].end - segs[0].start;
}

{
  const segs = arcSegments(3, { midAngle: 0 });
  assert(segs.length === 3, "3 segments");
  const span = spanOf(segs);
  assert(span < 360, "does not fill full circle");
  assert(span <= ARC_DEFAULTS.crowdedMaxSpanDeg + 0.01, "respects crowded max span");
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
  // Hold Person case: one medium title must NOT stretch to a parent quarter (~90°)
  const segs = arcSegments(1, {
    midAngle: 0,
    titles: ["Hold Person (Legacy)"],
    maxSpanDeg: 160
  });
  const w = segs[0].end - segs[0].start;
  assert(w < 70, "single titled leaf stays under quarter-circle");
  assert(w >= ARC_DEFAULTS.minSegmentDeg - 0.01, "single titled leaf respects min");
  assert(w <= ARC_DEFAULTS.maxSegmentDeg + 0.01, "single titled leaf respects max");
}

{
  const short = segmentDegForTitle("Dash");
  const long = segmentDegForTitle("Eldritch Invocations: Mask of Many Faces");
  assert(short < long, "longer titles get wider wedges");
  assert(short >= ARC_DEFAULTS.minSegmentDeg - 0.01, "short title hits min floor");
  assert(long <= ARC_DEFAULTS.maxSegmentDeg + 0.01, "long title hits max cap");
}

{
  const titles = [
    "Eldritch Blast",
    "Eldritch Invocations: Eldritch Mind",
    "Eldritch Invocations: Mask of Many Faces",
    "Eldritch Invocations: One with Shadows",
    "Empowered Healing"
  ];
  const soft = arcSegments(titles.length, {
    midAngle: 90,
    titles,
    maxSpanDeg: 160
  });
  const softSpan = spanOf(soft);
  assert(softSpan > 160, "crowded titled nest grows past soft maxSpan");
  assert(softSpan <= ARC_DEFAULTS.crowdedMaxSpanDeg + 0.01, "crowded nest respects hard cap");
  assert(softSpan < 360, "crowded nest still leaves a gap");

  // Wider leaves for longer titles (order preserved)
  const widths = soft.map(s => s.end - s.start);
  assert(widths[0] < widths[2], "longest title wider than short blast name");
  assert(widths.every(w => w >= ARC_DEFAULTS.minSegmentDeg - 0.01), "all leaves meet min hit target");
}

{
  const many = arcSegments(12, { midAngle: 0, maxSpanDeg: 200, crowdedMaxSpanDeg: 200 });
  const span = spanOf(many);
  assert(span <= 200.01, "large equal counts cap at explicit crowded max");
  assert(span < 360, "still leaves a gap");
}

{
  const action = mainSectionById("action");
  const segs = arcSegmentsForParent(5, action.start, action.end, {
    titles: ["Longsword", "Dash", "Disengage", "Use Item", "Cast Spell"]
  });
  const mid = normalizeMid(action.start, action.end);
  assert(Math.abs(((segs[0].start + segs[4].end) / 2) - mid) < 2, "action nest fans over Action wedge");
}

{
  // Parent quarter must not force a single leaf to fill it
  const parent = { start: 0, end: 90 };
  const segs = arcSegmentsForParent(1, parent.start, parent.end, {
    titles: ["Hold Person"],
    maxSpanDeg: 160
  });
  assert(segs[0].end - segs[0].start < 80, "parented single leaf leaves empty gap");
}

{
  const maxChars = captionCharsForSweep(40);
  assert(maxChars > 14, "wider sweep allows more caption chars than old 14 cap");
  const fitted = fitCaptionToSweep("Eldritch Invocations: Mask of Many Faces", 0, 48);
  assert(!fitted.endsWith("…") || fitted.length > 13, "fitCaption uses sweep-aware length");
  const tiny = fitCaptionToSweep("Hold Person (Legacy)", 0, 10);
  assert(tiny.includes("…"), "very narrow sweep still ellipsizes");
}

console.log(`\n${passed} assertions passed`);
