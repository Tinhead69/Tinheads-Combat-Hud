/**
 * Module-owned HUD chrome art.
 *
 * HARD RULE: Never override character-sheet / document `item.img` for
 * weapons, spells, inventory, or class features that already have artwork.
 * These paths are only for non-document chrome (basics, Cast Spell / Use Item
 * parents, Checks, End Turn, main wedges, spell-level labels, ability letters,
 * Attack/Use Ability nest chrome, and missing-art fallbacks).
 *
 * Prefer clipped WebP wedge fills under assets/wedges/; SVG icons remain as
 * unused fallbacks if a wedge file is missing.
 */

export const MODULE_ID = "tinheads-combat-hud";

const ICON_ROOT = `modules/${MODULE_ID}/assets/icons`;
const WEDGE_ROOT = `modules/${MODULE_ID}/assets/wedges`;

/**
 * @param {string} name file stem under assets/icons/
 * @returns {string}
 */
export function moduleIcon(name) {
  return `${ICON_ROOT}/${name}.svg`;
}

/**
 * Painterly wedge fill (WebP) for annular clip fills.
 * @param {string} name file stem under assets/wedges/
 * @returns {string}
 */
export function moduleWedge(name) {
  return `${WEDGE_ROOT}/${name}.webp`;
}

/** Preview / static HTTP: relative path from preview/ to wedge WebP. */
export function previewWedge(name) {
  return `../assets/wedges/${name}.webp`;
}

/** Preview SVG fallback (legacy). */
export function previewIcon(name) {
  return `../assets/icons/${name}.svg`;
}

export const CHROME = Object.freeze({
  dash: moduleWedge("dash"),
  disengage: moduleWedge("disengage"),
  dodge: moduleWedge("dodge"),
  ready: moduleWedge("ready"),
  castSpell: moduleWedge("cast-spell"),
  useItem: moduleWedge("use-item"),
  checks: moduleWedge("checks"),
  check: moduleWedge("check"),
  save: moduleWedge("save"),
  endTurn: moduleWedge("end-turn"),
  action: moduleWedge("action"),
  bonus: moduleWedge("bonus"),
  reaction: moduleWedge("reaction"),
  attack: moduleWedge("attack"),
  useAbility: moduleWedge("use-ability"),
  classFeature: moduleWedge("class-feature"),
  channelDivinity: moduleWedge("channel-divinity"),
  fallback: moduleWedge("fallback"),
  spellCantrip: moduleWedge("spell-cantrip"),
  abilities: Object.freeze({
    str: moduleWedge("str"),
    dex: moduleWedge("dex"),
    con: moduleWedge("constitution"),
    int: moduleWedge("int"),
    wis: moduleWedge("wis"),
    cha: moduleWedge("cha")
  })
});

/**
 * Spell-level chrome (Cantrip / 1st…9th). Not a spell document image.
 * @param {number} level
 */
export function spellLevelIcon(level) {
  if (level === "innate" || level === "pact" || level === "atwill") return CHROME.castSpell;
  if (level === 0) return CHROME.spellCantrip;
  if (level >= 1 && level <= 9) return moduleWedge(`spell-${level}`);
  return CHROME.fallback;
}

/**
 * Prefer document artwork; only then module chrome / Foundry default.
 * @param {string|null|undefined} documentImg item.img / activity.img
 * @param {string} chromePath module wedge or SVG
 */
export function preferDocumentImg(documentImg, chromePath) {
  const img = typeof documentImg === "string" ? documentImg.trim() : "";
  if (img) return img;
  return chromePath || CHROME.fallback;
}

/**
 * Fallback when a class feature has no sheet artwork.
 * @param {Item} item
 */
export function classFeatureChromeIcon(item) {
  const name = String(item?.name || "").toLowerCase();
  if (name.includes("channel divinity")) return CHROME.channelDivinity;
  return CHROME.classFeature;
}
