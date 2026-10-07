/**
 * Core Action-economy options for the Action sub-radial:
 * Dash, Disengage, Dodge, Ready.
 *
 * Prefer an actor-owned item/activity when present; otherwise module-backed
 * chat announcement (no invented rules automation).
 */

import {
  getActivities,
  getActivationType,
  getAttackHandle,
  isUnarmedItem,
  t
} from "./actor-options.mjs";
import { enrichWeaponOption } from "./weapon-abilities.mjs";
import { CHROME, preferDocumentImg } from "./module-icons.mjs";

/** @typedef {"dash"|"disengage"|"dodge"|"ready"} BasicActionId */

/**
 * Stable catalog — PHB-ish Action order.
 * Module SVGs for chrome only; sheet item.img wins when a matching feat exists.
 * @type {Array<{ id: BasicActionId, nameKey: string, name: string, img: string, aliases: string[] }>}
 */
export const BASIC_ACTIONS = [
  {
    id: "dash",
    nameKey: "BasicActions.Dash",
    name: "Dash",
    img: CHROME.dash,
    aliases: ["dash"]
  },
  {
    id: "disengage",
    nameKey: "BasicActions.Disengage",
    name: "Disengage",
    img: CHROME.disengage,
    aliases: ["disengage"]
  },
  {
    id: "dodge",
    nameKey: "BasicActions.Dodge",
    name: "Dodge",
    img: CHROME.dodge,
    aliases: ["dodge"]
  },
  {
    id: "ready",
    nameKey: "BasicActions.Ready",
    name: "Ready",
    img: CHROME.ready,
    aliases: ["ready", "ready action", "ready an action"]
  }
];

/**
 * Build Action-ring entries for core basics (no weapons / Cast Spell).
 * Dedupes by action id — at most one wedge per Dash/Disengage/Dodge/Ready.
 *
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getBasicActionOptions(actor) {
  return BASIC_ACTIONS.map(def => resolveBasicAction(actor, def));
}

/**
 * @param {Actor} actor
 * @param {(typeof BASIC_ACTIONS)[number]} def
 */
function resolveBasicAction(actor, def) {
  const match = findActorBasicAction(actor, def);
  const label = safeLocalize(def.nameKey, def.name);

  if (match) {
    return {
      id: `basic:${def.id}`,
      kind: "basic",
      basicId: def.id,
      name: label,
      img: preferDocumentImg(match.img, def.img),
      item: match.item,
      activity: match.activity,
      available: true,
      requiresTarget: false,
      source: match.source,
      tooltip: {
        title: label,
        description: match.source === "item"
          ? t("BasicActions.FromSheet")
          : t("BasicActions.Hint")
      }
    };
  }

  return {
    id: `basic:${def.id}`,
    kind: "basic",
    basicId: def.id,
    name: label,
    img: def.img,
    item: null,
    activity: null,
    actor,
    available: true,
    requiresTarget: false,
    source: "module",
    tooltip: {
      title: label,
      description: t("BasicActions.Hint")
    }
  };
}

/**
 * Prefer an Action-activation item/activity named for this basic action.
 * Falls back to any identically named owned item (common SRD "Actions" features).
 *
 * @param {Actor} actor
 * @param {(typeof BASIC_ACTIONS)[number]} def
 * @returns {{ item: Item, activity: object|null, name: string, img: string, source: string }|null}
 */
export function findActorBasicAction(actor, def) {
  const aliases = def.aliases.map(a => normalizeName(a));
  const candidates = [];

  for (const item of actor.items ?? []) {
    const itemName = normalizeName(item.name);
    const identifier = normalizeName(item.system?.identifier || item.identifier || "");
    const itemMatches = aliases.some(a => itemName === a || identifier === a);

    const activities = getActivities(item);
    for (const activity of activities) {
      const actName = normalizeName(activity.name || "");
      const actMatches = aliases.some(a => actName === a);
      if (!actMatches && !(itemMatches && activities.length === 1)) continue;

      const activation = getActivationType(activity, item);
      // Action ring: prefer true Action activation; allow blank/special (legacy items)
      const isActionLike = !activation || activation === "action" || activation === "special";
      if (!isActionLike) continue;

      candidates.push({
        item,
        activity,
        name: activity.name || item.name,
        img: activity.img || item.img,
        source: "activity",
        score: scoreMatch({ itemMatches, actMatches, activation, itemName, actName, aliases })
      });
    }

    if (itemMatches) {
      // Item itself (legacy use / single-action feature)
      const activation = item.system?.activation?.type ?? "";
      const isActionLike = !activation || activation === "action" || activation === "special";
      if (isActionLike) {
        candidates.push({
          item,
          activity: activities[0] ?? null,
          name: item.name,
          img: item.img,
          source: "item",
          score: scoreMatch({
            itemMatches: true,
            actMatches: false,
            activation: activation || "action",
            itemName,
            actName: "",
            aliases
          }) + (activities.length ? 0 : 1)
        });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return {
    item: best.item,
    activity: best.activity,
    name: best.name,
    img: best.img,
    source: best.source
  };
}

function scoreMatch({ itemMatches, actMatches, activation, itemName, actName, aliases }) {
  let score = 0;
  if (actMatches) score += 4;
  if (itemMatches) score += 3;
  if (activation === "action") score += 2;
  if (aliases.includes(itemName) || aliases.includes(actName)) score += 1;
  return score;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeLocalize(key, fallback) {
  try {
    const v = t(key);
    if (v && !String(v).endsWith(key) && !String(v).includes(`TINHEADS_COMBAT_HUD.${key}`)) return v;
  } catch (_) {
    /* preview / tests */
  }
  return fallback;
}

/**
 * First Action radial: Attack, Dodge, Dash, Disengage, Ready, then Abilities and Use Item.
 * Weapons and spells live under Attack. Class features live under Abilities.
 * @param {Actor} actor
 * @param {Array<object>} [_weapons] kept so existing callers can still pass equipped weapons
 * @returns {Array<object>}
 */
export function buildActionRingEntries(actor, _weapons) {
  const basics = Object.fromEntries(getBasicActionOptions(actor).map(entry => [entry.basicId, entry]));
  const ready = basics.ready;
  return [
    attackHub(),
    basics.dodge,
    basics.dash,
    basics.disengage,
    {
      ...ready,
      kind: "ready",
      tooltip: {
        title: ready.name,
        description: t("ReadyNest.Hint")
      }
    },
    {
      kind: "abilities",
      id: "abilities",
      name: t("Abilities.Label"),
      img: CHROME.classFeature,
      available: true,
      tooltip: {
        title: t("Abilities.Label"),
        description: t("Abilities.Hint")
      }
    },
    useItemHub()
  ];
}

/**
 * Attack nest: equipped weapons, Unarmed Strike, Cast Spell.
 * @param {Actor} actor
 * @param {Array<object>} weapons from getEquippedWeapons
 * @returns {Array<object>}
 */
export function getAttackNestEntries(actor, weapons) {
  const armed = (weapons ?? [])
    .filter(weapon => !isUnarmedItem(weapon.item))
    .map(weapon => enrichWeaponOption({ kind: "weapon", ...weapon }));
  return [...armed, unarmedStrikeOption(actor), castSpellHub()];
}

/**
 * Ready nest: the action being readied.
 * @returns {Array<object>}
 */
export function getReadyNestEntries() {
  return [
    castSpellHub(),
    {
      kind: "attack",
      id: "ready-attack",
      name: t("ReadyNest.Attack"),
      img: CHROME.attack,
      available: true,
      tooltip: {
        title: t("ReadyNest.Attack"),
        description: t("AttackNest.Hint")
      }
    },
    {
      kind: "abilities",
      id: "ready-other",
      name: t("ReadyNest.Other"),
      img: CHROME.classFeature,
      available: true,
      tooltip: {
        title: t("ReadyNest.Other"),
        description: t("ReadyNest.OtherHint")
      }
    }
  ];
}

function attackHub() {
  return {
    kind: "attack",
    id: "attack",
    name: t("AttackNest.Label"),
    img: CHROME.attack,
    available: true,
    tooltip: {
      title: t("AttackNest.Label"),
      description: t("AttackNest.Hint")
    }
  };
}

function castSpellHub() {
  return {
    kind: "cast",
    id: "cast-spell",
    name: t("Sections.CastSpell"),
    img: CHROME.castSpell,
    available: true,
    tooltip: {
      title: t("Sections.CastSpell"),
      description: t("Sections.CastSpellHint")
    }
  };
}

function useItemHub() {
  return {
    kind: "useItem",
    id: "use-item",
    name: t("Sections.UseItem"),
    img: CHROME.useItem,
    available: true,
    tooltip: {
      title: t("Sections.UseItem"),
      description: t("Sections.UseItemHint")
    }
  };
}

/**
 * The sheet's Unarmed Strike when present, otherwise a chat announcement.
 * @param {Actor} actor
 * @returns {object}
 */
function unarmedStrikeOption(actor) {
  let found = null;
  for (const item of actor?.items ?? []) {
    if (!isUnarmedItem(item)) continue;
    found = item;
    break;
  }

  const label = safeLocalize("AttackNest.Unarmed", "Unarmed Strike");
  if (!found) {
    return {
      id: "unarmed",
      kind: "basic",
      basicId: "unarmed",
      name: label,
      img: CHROME.attack,
      item: null,
      activity: null,
      actor,
      available: true,
      requiresTarget: true,
      source: "module",
      tooltip: {
        title: label,
        description: t("AttackNest.UnarmedHint")
      }
    };
  }

  const handle = getAttackHandle(found);
  return enrichWeaponOption({
    kind: "weapon",
    id: `weapon:${found.id}`,
    name: found.name || label,
    img: preferDocumentImg(found.img, CHROME.attack),
    item: handle.item,
    activity: handle.activity,
    available: true,
    requiresTarget: true
  });
}
