/**
 * Wedge caption wrapping.
 * Run: node scripts/tests/wedge-text.test.mjs
 */

import { uprightTangentRotation, wedgeArcPath, wedgeCaptionLines, wedgeTextLayout } from "../ui/wedge-text.mjs";

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

assert(wedgeCaptionLines("Strength +2").join("|") === "Strength +2", "short ability stays on one line");
assert(wedgeCaptionLines("Dexterity +3").join("|") === "Dexterity +3", "dexterity fits on one line");
assert(wedgeCaptionLines("Constitution +3").join("|") === "Constitution|+3", "constitution keeps its name and modifier");
assert(wedgeCaptionLines("Intelligence +1").join("|") === "Intelligence|+1", "intelligence keeps its name and modifier");
assert(wedgeCaptionLines("Wisdom +2").join("|") === "Wisdom +2", "wisdom stays on one line");
assert(wedgeCaptionLines("Charisma +5").join("|") === "Charisma +5", "charisma stays on one line");
assert(!wedgeCaptionLines("Constitution +3").some(line => line.includes("…")), "ability names are not chopped");
assert(uprightTangentRotation(0) === 0, "north caption stays upright");
assert(uprightTangentRotation(90) === 90, "east caption follows the wedge");
assert(uprightTangentRotation(180) === 360, "south caption is flipped upright");
assert(uprightTangentRotation(270) === 270, "west caption follows the wedge");
const side = wedgeTextLayout({
  start: 80, end: 100, inner: 180, outer: 242, text: "Disengage"
});
assert(side.curve, "a side wedge follows the arc");
assert(!side.reversed, "an east wedge reads along the clockwise arc");
assert(side.fontPx < 13, "a narrow side wedge uses a smaller caption");
const spell = wedgeTextLayout({
  start: -10, end: 80, inner: 246, outer: 308,
  text: "Protection from Evil and Good (Legacy)",
  cx: 380, cy: 380
});
assert(spell.curve && !spell.reversed, "a wide top wedge curves the caption");
assert(!spell.lines.some(line => line.includes("…")), "a long arc keeps the full spell name");
assert(spell.radii[0] > 246 && spell.radii[0] < 308, "the caption sits inside the ring");
const bottom = wedgeTextLayout({
  start: 150, end: 210, inner: 110, outer: 172, text: "Use Item"
});
assert(bottom.reversed, "a bottom wedge flips the arc so the caption stays upright");
const dodge = wedgeTextLayout({
  start: -160.5, end: -127.5, inner: 110, outer: 172, text: "Dodge"
});
assert(dodge.reversed, "Dodge on the lower left stays upright");
const dash = wedgeTextLayout({
  start: -124.5, end: -91.5, inner: 110, outer: 172, text: "Dash"
});
assert(dash.reversed, "Dash on the lower left stays upright");
const arc = wedgeArcPath(380, 380, 277, spell.pathStart, spell.pathEnd, false);
assert(arc.startsWith("M ") && arc.includes(" A "), "the caption path is an arc");

console.log(`\n${passed} assertions passed`);
