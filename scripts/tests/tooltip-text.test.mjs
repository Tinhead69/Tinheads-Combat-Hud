/** Run: node scripts/tests/tooltip-text.test.mjs */
import assert from "node:assert/strict";

globalThis.game = { i18n: { format: key => key }, user: { isGM: true } };
globalThis.CONFIG = { DND5E: {} };

const { itemDescriptionText, sheetItemTooltip, buildSpellTooltipData } =
  await import("../data/actor-options.mjs");
const { tooltipText } = await import("../data/tooltip-text.mjs");
const { CombatHud } = await import("../ui/combat-hud.mjs");
const description = value => itemDescriptionText({ system: { description: { value } } });
const cases = [
  ["encoded HTML", () => assert.equal(description("&lt;p&gt;Gain &lt;strong&gt;advantage&lt;/strong&gt;.&lt;/p&gt;"), "Gain advantage.")],
  ["double encoded HTML", () => assert.equal(description("&amp;lt;p&amp;gt;Move 30 feet.&amp;lt;/p&amp;gt;"), "Move 30 feet.")],
  ["roll display labels", () => assert.equal(description("Deal [[/r 1d6]]{extra damage}."), "Deal extra damage.")],
  ["nested dice flavor brackets", () => assert.equal(description("Deal [[/damage 2d6[fire]]] damage."), "Deal 2d6 fire damage.")],
  ["reference options", () => assert.equal(description("Become &Reference[condition=frightened apply=false]."), "Become frightened.")],
  ["quoted damage configuration", () => assert.equal(description('[[/damage 2d6 type="fire" average=true]] damage'), "2d6 fire damage")],
  ["multiple damage types", () => assert.equal(description("[[/damage 1d6 type=fire & 1d4 type=cold]] damage"), "1d6 fire + 1d4 cold damage")],
  ["saving throw configuration", () => assert.equal(description("Make a [[/save dex dc=15]]."), "Make a DC 15 Dexterity saving throw.")],
  ["style and script contents", () => assert.equal(description("<style>p { color: red; }</style><script>hiddenCode()</script><p>Visible text.</p>"), "Visible text.")],
  ["typographic entities", () => assert.equal(description("Can&rsquo;t move&mdash;speed is 0.&nbsp;&copy;"), "Can’t move—speed is 0. ©")],
  ["invalid character entities", () => assert.equal(description("Before &#99999999; after"), "Before after")],
  ["opaque document IDs", () => assert.equal(description("@UUID[Compendium.dnd5e.spells.Item.A1b2C3d4E5f6G7h8]"), "")],
  ["activity system descriptions", () => assert.equal(itemDescriptionText(
    { system: { description: { value: "Item description." } } },
    { name: "Flame", system: { description: { value: "Activity description." } } }
  ), "Activity description.")],
  ["structured descriptions", () => assert.equal(itemDescriptionText({ system: { description: { unrelated: true } } }), "")],
  ["all tooltip fields", () => {
    const tooltip = sheetItemTooltip({ name: "<strong>Flame</strong>" }, {
      note: "&lt;b&gt;1 use left&lt;/b&gt;", range: "&lt;b&gt;60 ft&lt;/b&gt;", damage: "1d6 + @mod"
    });
    assert.equal(tooltip.title, "Flame");
    assert.equal(tooltip.description, "1 use left");
    assert.equal(tooltip.range, "60 ft");
    assert.equal(tooltip.damage, "1d6 + ability modifier");
  }],
  ["spell damage rows", () => assert.equal(buildSpellTooltipData({ name: "Flame" }, {
    damage: { parts: [["1d6 + @abilities.int.mod", "fire"]] }
  }).damage, "1d6 + Intelligence modifier fire")],
  ["ordinary rules text", () => assert.equal(description("5 < 10, 10 > 5. A & B; 2d6 + 3 damage."), "5 < 10, 10 > 5. A & B; 2d6 + 3 damage.")],
  ["existing explicit document labels", () => assert.equal(description("Use @UUID[Compendium.dnd5e.spells.Item.A1b2C3d4E5f6G7h8]{Fireball}."), "Use Fireball.")],
  ["quoted HTML attributes", () => assert.equal(description('<p data-tooltip="DC > 10">Visible text.</p>'), "Visible text.")],
  ["numeric tooltip values", () => assert.equal(tooltipText(0), "0")],
  ["choice of saving throws", () => assert.equal(description("[[/save ability=dex|con dc=15]]"), "DC 15 Dexterity or Constitution saving throw")],
  ["loaded document names", () => {
    const previous = globalThis.fromUuidSync;
    try {
      globalThis.fromUuidSync = () => ({ name: "Fireball" });
      assert.equal(description("Use @UUID[Compendium.dnd5e.spells.Item.A1b2C3d4E5f6G7h8]."), "Use Fireball.");
    } finally { globalThis.fromUuidSync = previous; }
  }],
  ["renderer normalizes and escapes direct tooltip sources", () => {
    const tooltipEl = { style: {}, hidden: true };
    CombatHud.prototype.showTooltip.call({ tooltipEl }, {
      title: "<strong>Flame</strong>",
      description: "&lt;p&gt;Make a [[/save dex dc=15]].&lt;/p&gt;",
      range: "Distance < 10 feet", targets: 0
    }, null);
    assert.equal(tooltipEl.hidden, false);
    assert(tooltipEl.innerHTML.includes('tch-tooltip__title">Flame</p>'));
    assert(tooltipEl.innerHTML.includes("Make a DC 15 Dexterity saving throw."));
    assert(tooltipEl.innerHTML.includes("Distance &lt; 10 feet"));
    assert(!tooltipEl.innerHTML.includes("[[") && !tooltipEl.innerHTML.includes("&lt;p&gt;"));
  }],
  ["description length after formatting removal", () => {
    const output = description("<p>" + "A".repeat(500) + "</p>");
    assert.equal(output.length, 420);
    assert(output.endsWith("…"));
  }]
];

let failed = 0;
for (const [name, test] of cases) {
  try { test(); console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} tooltip cases passed`);
if (failed) process.exitCode = 1;
