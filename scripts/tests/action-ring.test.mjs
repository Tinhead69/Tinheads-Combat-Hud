/**
 * Checks for Action-ring basics + Use Item inventory filter.
 * Run: node scripts/tests/action-ring.test.mjs
 */

globalThis.game = {
  i18n: { format: (key) => key },
  user: { isGM: true, targets: new Set() }
};
globalThis.foundry = { utils: { duplicate: (v) => JSON.parse(JSON.stringify(v)) } };
globalThis.CONFIG = { DND5E: { defaultArtwork: { Item: {} } } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };

const { buildActionRingEntries, buildEconomyRingEntries, findActorBasicAction, BASIC_ACTIONS, getBasicActionOptions, getAttackNestEntries, getReadyNestEntries } =
  await import("../data/basic-actions.mjs");
const { getUsableInventoryItems } = await import("../data/use-items.mjs");
const { getEquippedWeapons, getActivationOptions, getSpellLevels, itemArtwork, activityArtwork } = await import("../data/actor-options.mjs");
const { getClassFeatureOptions } = await import("../data/action-features.mjs");

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed += 1;
  console.log("ok:", msg);
}

function item(partial) {
  return {
    id: partial.id || partial.name,
    type: partial.type || "feat",
    name: partial.name,
    img: partial.img || "",
    isOwner: true,
    system: {
      identifier: partial.identifier || "",
      activation: partial.activation || { type: "action" },
      quantity: partial.quantity ?? 1,
      description: { value: partial.description || "" },
      activities: partial.activities || null,
      ...(partial.system || {})
    },
    use: partial.use
  };
}

const actor = {
  id: "A1",
  items: [
    item({ name: "Dodge", type: "feat", identifier: "dodge" }),
    item({ name: "Potion of Healing", type: "consumable", quantity: 2 }),
    item({ name: "Empty Flask", type: "consumable", quantity: 0 }),
    item({ name: "Thieves' Tools", type: "tool" }),
    item({ name: "Longsword", type: "weapon" }),
    item({ name: "Chain Mail", type: "equipment", system: { type: { value: "heavy" }, armor: { value: 16 } } }),
    item({
      name: "Armor of Gleaming",
      type: "equipment",
      activities: [{ id: "gleam", name: "Gleam", type: "utility", activation: { type: "action" } }],
      system: { type: { value: "medium" } }
    }),
    item({ name: "Fire Bolt", type: "spell", system: { level: 0, preparation: { mode: "always", prepared: true } } }),
    item({
      name: "Cunning Action",
      type: "feat",
      activities: [
        { id: "1", name: "Dash", type: "utility", activation: { type: "bonus" }, img: "" }
      ]
    })
  ],
  system: { favorites: [], spells: {} },
  isOwner: true
};

// Prefer sheet Dodge item
const dodgeDef = BASIC_ACTIONS.find(a => a.id === "dodge");
const dodgeMatch = findActorBasicAction(actor, dodgeDef);
assert(!!dodgeMatch, "finds sheet Dodge");
assert(dodgeMatch.item.name === "Dodge", "Dodge item matched");

// Bonus-only Dash from Cunning Action should NOT satisfy Action Dash
const dashDef = BASIC_ACTIONS.find(a => a.id === "dash");
const dashMatch = findActorBasicAction(actor, dashDef);
assert(!dashMatch, "bonus-only Dash not used for Action ring");

const basics = getBasicActionOptions(actor);
assert(basics.length === 4, "four basics");
assert(basics.find(b => b.basicId === "dodge").source !== "module", "dodge from sheet");
assert(basics.find(b => b.basicId === "dodge").name === "Dodge", "dodge keeps its action name");
assert(basics.find(b => b.basicId === "dash").source === "module", "dash module fallback");

const midiNamed = {
  ...actor,
  items: [
    ...actor.items,
    item({
      name: "Disengage",
      type: "feat",
      identifier: "disengage",
      activities: [{ id: "midi", name: "Midi Use", type: "utility", activation: { type: "action" } }]
    })
  ]
};
const disengage = getBasicActionOptions(midiNamed).find(b => b.basicId === "disengage");
assert(disengage.name === "Disengage", "Midi Use activity still labels the wedge Disengage");
assert(disengage.activity.name === "Midi Use", "sheet activity is still the one that resolves");

const weapons = [];
const entries = buildActionRingEntries(actor, weapons);
assert(entries.some(e => e.kind === "useItem"), "has Use Item hub");
assert(entries.some(e => e.kind === "attack"), "has Attack hub");
assert(entries.some(e => e.kind === "abilities"), "has Abilities hub");
assert(entries.some(e => e.kind === "ready"), "Ready is a nest");
assert(entries.some(e => e.kind === "cast" && e.economy === "action"), "Cast Spell is on the Action ring");
assert(entries.filter(e => e.kind === "basic").length === 4, "Dodge, Dash, Disengage, and Help");
assert(entries.some(e => e.basicId === "help" && e.kind === "basic"), "Help is on the Action ring");
const kinds = entries.map(e => e.kind);
assert(kinds.join(",") === "basic,basic,basic,basic,attack,cast,ready,other,abilities,useItem", "Dodge, Dash, Disengage, Help, Attack, Cast Spell, Ready, Other, Abilities, Use Item");
const attackAt = entries.findIndex(e => e.kind === "attack");
assert(entries[attackAt + 1]?.kind === "cast", "Cast Spell sits beside Attack");
const attackNest = getAttackNestEntries(actor, []);
assert(!attackNest.some(e => e.kind === "cast"), "Attack nest is weapons and unarmed strike");
assert(attackNest.some(e => e.name === "Unarmed Strike"), "Unarmed Strike is under Attack");
const readyNest = getReadyNestEntries();
assert(readyNest.map(e => e.kind).join(",") === "cast,attack,basic", "Ready opens Cast Spell, Attack, and a plain Other Action");
assert(readyNest.find(e => e.id === "ready-other")?.kind === "basic", "Other Action does not open another ring");

const inv = getUsableInventoryItems(actor);
assert(inv.some(i => i.name === "Potion of Healing"), "includes potion");
assert(inv.every(i => i.name !== "Longsword"), "excludes weapons");
assert(inv.every(i => i.name !== "Chain Mail"), "armour stays out of Use Item");
assert(inv.every(i => i.name !== "Armor of Gleaming"), "magical armour stays out of Use Item");
assert(inv.every(i => i.name !== "Thieves' Tools"), "tools stay out of Use Item");
assert(inv.every(i => i.name !== "Fire Bolt"), "excludes spells");
assert(inv.find(i => i.name === "Empty Flask")?.available === false, "qty 0 unavailable");

const equippedActor = {
  items: [
    { id: "w1", type: "weapon", name: "Longsword", sort: 2, img: "", system: { equipped: true, activation: { type: "action" } } },
    { id: "w2", type: "weapon", name: "Dagger", sort: 1, img: "", system: { equipped: false, activation: { type: "action" } } },
    { id: "w3", type: "weapon", name: "Shortbow", sort: 3, img: "", system: { equipped: true, activation: { type: "action" } } },
    { id: "a1", type: "equipment", name: "Shield", sort: 0, img: "", system: { equipped: true } }
  ],
  system: { favorites: [{ id: ".Item.w2", type: "item", sort: 0 }] }
};
const equipped = getEquippedWeapons(equippedActor);
assert(equipped.map(w => w.name).join(",") === "Longsword,Shortbow", "equipped weapons only, in sheet order");
assert(equipped.every(w => w.name !== "Dagger"), "unequipped favorite stays off the ring");
assert(equipped.every(w => w.name !== "Shield"), "equipped non-weapons stay off the ring");

const bonusActor = {
  items: [
    item({
      name: "Potion of Healing",
      type: "consumable",
      img: "icons/consumables/potions/bottle-red.webp",
      activities: [{ id: "h1", name: "Midi Heal", type: "heal", activation: { type: "bonus" }, img: "icons/svg/aura.svg" }]
    }),
    item({
      name: "Potion of Greater Healing",
      type: "consumable",
      activities: [{ id: "h2", name: "Midi Heal", type: "heal", activation: { type: "bonus" } }]
    }),
    item({
      name: "Hex",
      type: "consumable",
      activities: [{ id: "hex", name: "Hex Damage", type: "damage", activation: { type: "bonus" } }]
    }),
    item({
      name: "Misty Step",
      type: "spell",
      activation: { type: "bonus" },
      system: { level: 2, method: "spell", prepared: 1 },
      activities: [{ id: "cast", name: "Cast", type: "cast", activation: { type: "action" } }]
    }),
    item({
      name: "Bless",
      type: "spell",
      activation: { type: "action" },
      system: { level: 1, method: "spell", prepared: 1 }
    })
  ],
  system: { spells: { spell1: { value: 2, max: 2 }, spell2: { value: 1, max: 2 } } },
  isOwner: true,
  testUserPermission: () => true
};
const bonus = getActivationOptions(bonusActor, "bonus");
assert(bonus.find(o => o.item.name === "Potion of Healing")?.name === "Potion of Healing", "Midi Heal wedge uses the potion name");
assert(bonus.find(o => o.item.name === "Potion of Greater Healing")?.name === "Potion of Greater Healing", "each potion keeps its own name");
assert(bonus.find(o => o.item.name === "Potion of Healing")?.activity.name === "Midi Heal", "potion still resolves the Midi Heal activity");
assert(bonus.find(o => o.item.name === "Potion of Healing")?.img === "icons/consumables/potions/bottle-red.webp", "potion wedge uses the item image");

const midiIconActor = {
  items: [
    item({
      name: "Fireball",
      type: "spell",
      img: "icons/magic/fireball.webp",
      activities: [{ id: "cast", name: "Cast", type: "cast", activation: { type: "action" }, img: "modules/midi-qol/icons/midi-qol.png" }]
    }),
    item({
      name: "Lay on Hands",
      type: "feat",
      img: "icons/magic/lay-on-hands.webp",
      activities: [{ id: "heal", name: "Lay on Hands", type: "heal", activation: { type: "action" }, img: "modules/midi-qol/icons/heal.png" }]
    })
  ]
};
const fireball = midiIconActor.items[0];
const layOnHands = midiIconActor.items[1];
assert(itemArtwork(fireball, fireball.system.activities[0]) === "icons/magic/fireball.webp", "spell keeps its image instead of the Midi icon");
assert(activityArtwork(layOnHands, layOnHands.system.activities[0]) === "icons/magic/lay-on-hands.webp", "feature mode ignores a Midi activity icon");
assert(getClassFeatureOptions(midiIconActor, "action").find(f => f.name === "Lay on Hands")?.img === "icons/magic/lay-on-hands.webp", "ability wedge uses the feature image");
assert(bonus.find(o => o.item.name === "Hex")?.name === "Hex Damage", "real activity names stay on the wedge");
assert(!bonus.some(o => o.item?.type === "spell"), "bonus spells are not activity wedges");
const bonusRing = buildEconomyRingEntries(bonusActor, "bonus");
assert(bonusRing[0]?.kind === "cast" && bonusRing[0].economy === "bonus", "bonus ring starts with Cast Spell");
assert(!bonusRing.some(e => e.kind === "spell" || e.name === "Misty Step"), "bonus spells stay inside Cast Spell");
assert(!bonusRing.some(e => e.name === "Bless"), "action spells stay off the bonus ring");
assert(!bonusRing.some(e => e.name === "Cast"), "a bonus spell's Cast activity is not its own wedge");
const actionSpells = getSpellLevels(bonusActor, "action").levels.flatMap(level => level.spells.map(spell => spell.name));
const bonusSpells = getSpellLevels(bonusActor, "bonus").levels.flatMap(level => level.spells.map(spell => spell.name));
assert(actionSpells.includes("Bless") && !actionSpells.includes("Misty Step"), "action Cast Spell lists only action spells");
assert(bonusSpells.includes("Misty Step") && !bonusSpells.includes("Bless"), "bonus Cast Spell lists only bonus spells");
const reactionRing = buildEconomyRingEntries({ items: [], system: { spells: {} }, isOwner: true, testUserPermission: () => true }, "reaction");
assert(reactionRing[0]?.id === "attack-of-opportunity", "reaction ring always starts with Attack of Opportunity");
assert(reactionRing.filter(entry => entry.kind === "opportunity").length === 1, "Attack of Opportunity is not repeated");

console.log(`\n${passed} assertions passed`);
