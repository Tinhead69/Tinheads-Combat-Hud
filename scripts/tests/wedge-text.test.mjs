/**
 * Wedge caption wrapping.
 * Run: node scripts/tests/wedge-text.test.mjs
 */

import { wedgeCaptionLines } from "../ui/wedge-text.mjs";

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

console.log(`\n${passed} assertions passed`);
