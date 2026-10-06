/**
 * HUD placement clamp + class-feature activation routing.
 * Run: node scripts/tests/placement-features.test.mjs
 */

globalThis.game = {
  i18n: { format: (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key), localize: (k) => k },
  user: { isGM: true, id: "U1", targets: new Set(), getFlag: () => null, setFlag: async () => {} }
};
globalThis.foundry = { utils: { duplicate: (v) => JSON.parse(JSON.stringify(v)) } };
globalThis.CONFIG = { DND5E: { defaultArtwork: { Item: {} }, abilities: {} } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }
};

const {
  clampHudCenter,
  contentOuterRadius,
  DRAG_THRESHOLD_PX,
  VIEWPORT_MARGIN
} = await import("../ui/hud-placement.mjs");
const { RINGS } = await import("../ui/combat-hud.mjs");
const {
  getClassFeatureOptions,
  getFeatureModeOptions,
  isRestOnlyActivity,
  matchesActivation
} = await import("../data/action-features.mjs");

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

assert(DRAG_THRESHOLD_PX >= 4, "drag threshold defined");
assert(VIEWPORT_MARGIN >= 8, "viewport margin defined");

{
  const c = clampHudCenter(10, 10, 100, { width: 800, height: 600, margin: 14 });
  assert(c.x === 114 && c.y === 114, "clamps top-left into margin+radius");
  const d = clampHudCenter(900, 700, 100, { width: 800, height: 600, margin: 14 });
  assert(d.x === 800 - 114 && d.y === 600 - 114, "clamps bottom-right");
  const mid = clampHudCenter(400, 300, 400, { width: 800, height: 600, margin: 14 });
  assert(mid.x === 400 && mid.y === 300, "oversized radius pins to center");
}

{
  const collapsed = contentOuterRadius({ section: null }, RINGS);
  assert(collapsed === RINGS.mainOuter, "collapsed uses main outer");
  const nested = contentOuterRadius({
    section: "action", castSpell: true, spellLevel: 1
  }, RINGS);
  assert(nested === RINGS.nest2Outer, "spell nest uses nest2");
  const checks = contentOuterRadius({
    section: "checks", abilityId: "str"
  }, RINGS);
  assert(checks === RINGS.nest1Outer, "check|save nest uses nest1");
}

assert(matchesActivation("action", "action"), "action matches action");
assert(matchesActivation("special", "action"), "special counts as action");
assert(!matchesActivation("", "action"), "empty activation not action");
assert(!matchesActivation("rest", "bonus"), "rest not bonus");
assert(matchesActivation("bonus", "bonus"), "bonus matches");

assert(
  isRestOnlyActivity(
    { name: "Recover Sorcery Points", activation: { type: "action" } },
    { name: "Font of Magic" }
  ),
  "recover sorcery excluded even if mis-tagged action"
);
assert(
  isRestOnlyActivity(
    { name: "Create Spell Slot", activation: { type: "" } },
    { name: "Font of Magic" }
  ),
  "empty activation treated as rest-only"
);

const sorcerer = {
  id: "S1",
  items: [
    {
      id: "font",
      name: "Font of Magic",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        uses: { value: 4, max: 4 },
        activities: [
          { id: "create", name: "Create Spell Slot", type: "utility", activation: { type: "bonus" } },
          { id: "convert", name: "Convert Spell Slot", type: "utility", activation: { type: "bonus" } },
          { id: "recover", name: "Recover Sorcery Points", type: "utility", activation: { type: "special" } }
        ]
      }
    },
    {
      id: "cd",
      name: "Channel Divinity",
      type: "feat",
      img: "",
      isOwner: true,
      system: {
        uses: { value: 1, max: 1 },
        activities: [
          { id: "tu", name: "Turn Undead", type: "save", activation: { type: "action" } }
        ]
      }
    }
  ]
};

const actionFeats = getClassFeatureOptions(sorcerer, "action");
assert(actionFeats.some(f => f.name === "Channel Divinity"), "Channel Divinity on Action");
assert(!actionFeats.some(f => f.name === "Font of Magic"), "Font of Magic not forced onto Action");
const cd = actionFeats.find(f => f.name === "Channel Divinity");
assert(getFeatureModeOptions(cd).some(m => m.name === "Turn Undead"), "Turn Undead under CD nest");

const bonusFeats = getClassFeatureOptions(sorcerer, "bonus");
assert(bonusFeats.some(f => f.name === "Font of Magic"), "Font of Magic on Bonus Action");
const font = bonusFeats.find(f => f.name === "Font of Magic");
const modes = getFeatureModeOptions(font);
assert(modes.length === 2, "two flexible-casting modes (no recover)");
assert(!modes.some(m => /recover/i.test(m.name)), "recover sorcery not in BA nest");
assert(font.usesLabel === "4/4", "sorcery uses pool visible");

console.log(`\n${passed} assertions passed`);
