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

const { buildActionRingEntries, findActorBasicAction, BASIC_ACTIONS, getBasicActionOptions } =
  await import("../data/basic-actions.mjs");
const { getUsableInventoryItems } = await import("../data/use-items.mjs");
const { getEquippedWeapons } = await import("../data/actor-options.mjs");

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
assert(basics.find(b => b.basicId === "dash").source === "module", "dash module fallback");

const weapons = [];
const entries = buildActionRingEntries(actor, weapons);
assert(entries.some(e => e.kind === "useItem"), "has Use Item hub");
assert(entries.some(e => e.kind === "cast"), "has Cast Spell hub");
assert(entries.filter(e => e.kind === "basic").length === 4, "four basic wedges");
const kinds = entries.map(e => e.kind);
assert(kinds.indexOf("basic") < kinds.indexOf("useItem"), "basics before Use Item");
assert(kinds.indexOf("useItem") < kinds.indexOf("cast"), "Use Item before Cast Spell");

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

console.log(`\n${passed} assertions passed`);
