/**
 * Class features / limited-use options routed by dnd5e activation.
 * Action → Action ring; Bonus → BA; Reaction → R.
 * Multi-mode feats (Channel Divinity, Metamagic, Font of Magic) nest their modes.
 * Separate "Channel Divinity: …" and "Metamagic: …" feats collapse onto one button.
 * Rest-only recovery (e.g. Recover Sorcery Points) is never a combat leaf.
 */

import {
  canAttemptUse,
  getActivities,
  getActivationType,
  activityArtwork,
  activityOptionName,
  itemArtwork,
  optionRequiresTarget,
  sheetItemTooltip,
  t
} from "./actor-options.mjs";
import { isAttackActivity } from "./weapon-abilities.mjs";
import { CHROME, classFeatureChromeIcon, preferDocumentImg } from "./module-icons.mjs";

/** Mirror of core Action names so Dash/etc. stay on the basics wedges only. */
const BASIC_NAMES = new Set([
  "dash",
  "disengage",
  "dodge",
  "help",
  "ready",
  "ready action",
  "ready an action"
]);

/**
 * Sheet feats that are not buttons.
 * Extra Attack only changes the Attack action. "Attack" and "Unarmed Strike"
 * are the Attack nest itself. "Magic" is Cast Spell, already under Action.
 * "Midi Use" is a Midi-QOL activity name, not a player action — those items
 * still live on the actor, they just are not wedges.
 */
/**
 * Mundane combat actions. They sit under Action → Other, not Abilities.
 * Names and identifiers are compared after normalize().
 */
const OTHER_ACTION_NAMES = new Set([
  "grapple",
  "shove",
  "mount",
  "dismount",
  "mount or dismount",
  "hide",
  "influence",
  "search",
  "study",
  "utilize",
  "use an object",
  "squeeze",
  "stabilize",
  "jump",
  "knock out",
  "knockout",
  "improvise",
  "improvised action",
  "improvisation",
  "escape a grapple"
]);

const SUPPRESSED_FEATURES = new Set([
  "extra attack",
  "extra attacks",
  "midi use",
  "midi qol",
  "midiqol",
  "attack",
  "unarmed strike",
  "magic"
]);

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function isSuppressedActionFeature(item) {
  const name = normalize(item?.name);
  const ident = normalize(item?.system?.identifier);
  return SUPPRESSED_FEATURES.has(name) || SUPPRESSED_FEATURES.has(ident);
}

/**
 * Shove, grapple, mount, and the other plain actions from the sheet.
 * @param {Item} item
 * @returns {boolean}
 */
export function isOtherActionItem(item) {
  const name = normalize(item?.name);
  const ident = normalize(item?.system?.identifier);
  return OTHER_ACTION_NAMES.has(name) || OTHER_ACTION_NAMES.has(ident);
}

/**
 * Named feature families. The shell (or a synthetic one) is the only wedge.
 * "Family: Option" feats and subtype-tagged options open on the next radial.
 */
const FEATURE_FAMILIES = [
  { id: "channel-divinity", name: "Channel Divinity", key: "channel divinity", subtype: "channeldivinity" },
  { id: "metamagic", name: "Metamagic", key: "metamagic", subtype: "metamagic" }
];

/** Activations that never belong on Action / BA / Reaction combat rings. */
const NON_COMBAT_ACTIVATIONS = new Set([
  "",
  "none",
  "rest",
  "hour",
  "day",
  "minute",
  "week",
  "year",
  "permanent"
]);

/**
 * Class features for one economy ring.
 * @param {Actor} actor
 * @param {"action"|"bonus"|"reaction"} activation
 * @returns {Array<object>}
 */
export function getClassFeatureOptions(actor, activation = "action") {
  return collectFeatureOptions(actor, activation, false);
}

/**
 * Action → Other. Shove, grapple, mount, and similar sheet actions.
 * @param {Actor} actor
 * @returns {Array<object>}
 */
export function getOtherActionOptions(actor) {
  return collectFeatureOptions(actor, "action", true);
}

/**
 * @param {Actor} actor
 * @param {"action"|"bonus"|"reaction"} activation
 * @param {boolean} otherOnly
 */
function collectFeatureOptions(actor, activation, otherOnly) {
  const feats = [];
  for (const item of actor.items ?? []) {
    if (item?.type !== "feat") continue;
    if (BASIC_NAMES.has(normalize(item.name)) || BASIC_NAMES.has(normalize(item.system?.identifier))) {
      continue;
    }
    if (isSuppressedActionFeature(item)) continue;
    if (otherOnly ? !isOtherActionItem(item) : isOtherActionItem(item)) continue;
    feats.push(item);
  }

  // Channel Divinity and Metamagic: one button, options on the next radial.
  const groups = FEATURE_FAMILIES.map(family => {
    const shells = feats.filter(item => isFamilyParent(item, family));
    const parent = pickFamilyParent(shells);
    const children = feats.filter(item => isFamilyOption(item, parent, family));
    return { family, shells, parent, children };
  });
  const hiddenIds = new Set(
    groups.flatMap(group => [...group.shells, ...group.children].map(item => item.id))
  );

  const options = [];

  for (const item of feats) {
    if (hiddenIds.has(item.id)) continue;

    const { matching, legacyMatch } = activationMatch(item, activation);
    if (!matching.length && !legacyMatch) continue;

    if (activation === "bonus" && isRogueActor(actor) && isCunningActionItem(item)) {
      options.push(makeCunningActionLeaf(item, activation));
      continue;
    }

    if (!matching.length && legacyMatch) {
      options.push(makeLeaf({
        item,
        activity: null,
        hasNest: false,
        nestActivities: [],
        childItems: [],
        available: canAttemptUse(null, item),
        activation
      }));
      continue;
    }

    // Attack riders on a multi-activity feat are not their own button.
    // Midi automationOnly activities are internal triggers.
    const usable = matching.filter(activity => {
      if (isAutomationOnlyActivity(activity)) return false;
      return !isAttackActivity(activity) || matching.length === 1;
    });
    if (!usable.length) continue;

    const hasNest = usable.length > 1;
    const primary = usable[0];
    options.push(makeLeaf({
      item,
      activity: hasNest ? null : primary,
      hasNest,
      nestActivities: usable,
      childItems: [],
      available: canAttemptUse(hasNest ? null : primary, item),
      activation
    }));
  }

  for (const group of groups) {
    const leaf = buildFamilyLeaf(group.family, group.shells, group.parent, group.children, activation);
    if (leaf) options.push(leaf);
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/** @deprecated Use getClassFeatureOptions(actor, "action") */
export function getActionFeatureOptions(actor) {
  return getClassFeatureOptions(actor, "action");
}

/**
 * Leaves under a multi-mode feature (Channel Divinity / Font of Magic options).
 * @param {object} featureOption
 */
export function getFeatureModeOptions(featureOption) {
  if (featureOption?.cunningAction) return cunningActionModes(featureOption);
  if (featureOption?.featureFamily || featureOption?.channelDivinity) return familyModes(featureOption);

  const fromActivities = (featureOption.nestActivities ?? []).map((activity, index) => {
    const available = canAttemptUse(activity, featureOption.item);
    const name = activityOptionName(featureOption.item, activity) || featureOption.name;
    return {
      id: `${featureOption.id}:mode:${activity.id ?? activity._id ?? index}`,
      kind: "feature-mode",
      name,
      img: preferDocumentImg(activityArtwork(featureOption.item, activity), featureOption.img),
      item: activity?.item ?? activity?.parent ?? featureOption.item,
      activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(activity, activity?.item ?? featureOption.item),
      parentFeatureId: featureOption.id,
      usesLabel: formatUses(featureOption.item, activity),
      tooltip: describedTooltip(featureOption.item, activity, name)
    };
  });

  const fromItems = (featureOption.childItems ?? []).map(item => {
    const activity = primaryActivity(item, featureOption.activation);
    const available = canAttemptUse(activity, item);
    const name = FEATURE_FAMILIES.reduce(
      (label, family) => familyOptionLabel(label, family),
      item.name
    );
    return {
      id: `${featureOption.id}:item:${item.id}`,
      kind: "feature-mode",
      name,
      img: preferDocumentImg(itemArtwork(item, activity), featureOption.img),
      item,
      activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(activity, item),
      parentFeatureId: featureOption.id,
      usesLabel: formatUses(item, activity),
      tooltip: describedTooltip(item, activity, name)
    };
  });

  return [...fromActivities, ...fromItems];
}

/**
 * Rogue Cunning Action opens Hide, Dash, and Disengage instead of using the parent feat.
 * @param {Item} item
 * @param {"action"|"bonus"|"reaction"} activation
 */
function makeCunningActionLeaf(item, activation) {
  const leaf = makeLeaf({
    item,
    activity: null,
    hasNest: true,
    nestActivities: [],
    available: canAttemptUse(null, item),
    activation
  });
  return {
    ...leaf,
    cunningAction: true,
    tooltip: {
      title: item.name,
      description: t("CunningAction.Hint")
    }
  };
}

/**
 * @param {object} featureOption
 * @returns {Array<object>}
 */
function cunningActionModes(featureOption) {
  const actor = featureOption.item?.actor ?? null;
  const parentId = featureOption.id;
  const base = {
    item: null,
    activity: null,
    actor,
    available: true,
    requiresTarget: false,
    parentFeatureId: parentId
  };
  return [
    {
      ...base,
      id: `${parentId}:hide`,
      kind: "skill-check",
      skillId: "ste",
      name: t("CunningAction.Hide"),
      img: CHROME.abilities.dex,
      tooltip: {
        title: t("CunningAction.Hide"),
        description: t("CunningAction.HideHint")
      }
    },
    {
      ...base,
      id: `${parentId}:dash`,
      kind: "basic",
      basicId: "dash",
      name: t("BasicActions.Dash"),
      img: CHROME.dash,
      tooltip: {
        title: t("BasicActions.Dash"),
        description: t("CunningAction.DashHint")
      }
    },
    {
      ...base,
      id: `${parentId}:disengage`,
      kind: "basic",
      basicId: "disengage",
      name: t("BasicActions.Disengage"),
      img: CHROME.disengage,
      tooltip: {
        title: t("BasicActions.Disengage"),
        description: t("CunningAction.DisengageHint")
      }
    }
  ];
}

/**
 * Midi-QOL marks triggered riders automationOnly. They are not buttons.
 * @param {object} activity
 * @returns {boolean}
 */
function isAutomationOnlyActivity(activity) {
  const flags = activity?.flags?.["midi-qol"]
    ?? activity?.system?.midiProperties
    ?? activity?.midiProperties
    ?? null;
  return flags?.automationOnly === true;
}

function isRogueActor(actor) {
  if (actor?.classes?.rogue || actor?.system?.classes?.rogue) return true;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "class") continue;
    const id = normalize(item.system?.identifier || item.name);
    if (id === "rogue") return true;
  }
  return false;
}

function isCunningActionItem(item) {
  const name = normalize(item?.name);
  const ident = normalize(item?.system?.identifier);
  return name === "cunning action" || ident === "cunning action";
}

function makeLeaf({ item, activity, hasNest, nestActivities, childItems = [], available, activation, usesLabel = null }) {
  const poolLabel = usesLabel ?? formatUses(item, activity ?? nestActivities[0]);
  return {
    id: `feature:${activation}:${item.id}`,
    kind: "feature",
    name: item.name,
    img: preferDocumentImg(itemArtwork(item, activity), classFeatureChromeIcon(item)),
    item,
    activity,
    hasNest,
    nestActivities,
    childItems,
    activation,
    available: available.ok,
    reason: available.reason,
    requiresTarget: optionRequiresTarget(activity, item),
    usesLabel: poolLabel,
    tooltip: describedTooltip(item, activity ?? nestActivities?.[0], item.name, { hasNest })
  };
}

/**
 * Match combat activation. Action also accepts "special" (common for Channel Divinity shells).
 * Empty / rest / downtime types never match.
 */
export function matchesActivation(type, wanted) {
  const t = String(type ?? "").toLowerCase().trim();
  if (NON_COMBAT_ACTIVATIONS.has(t)) return false;
  if (wanted === "action") return t === "action" || t === "special";
  return t === wanted;
}

/**
 * Rest-only recovery (Recover Sorcery Points, etc.) — never a combat HUD leaf.
 */
export function isRestOnlyActivity(activity, item) {
  const type = String(getActivationType(activity, item) ?? "").toLowerCase().trim();
  if (NON_COMBAT_ACTIVATIONS.has(type)) return true;

  const name = normalize(activity?.name || "");
  // Explicit recover-sorcery style activities stay off combat rings even if mis-tagged.
  if (
    name.includes("recover sorcery")
    || name.includes("regain sorcery")
    || name === "sorcery points"
    || (name.includes("recover") && name.includes("sorcery"))
    || (name.includes("regain") && name.includes("points") && normalize(item?.name || "").includes("font of magic"))
  ) {
    return true;
  }

  // "During a short/long rest" style names with non combat activations
  if (/(short|long)\s*rest/.test(name) && !["action", "bonus", "reaction"].includes(type)) {
    return true;
  }

  return false;
}

function isRestOnlyItem(item) {
  const type = String(item?.system?.activation?.type ?? "").toLowerCase().trim();
  if (NON_COMBAT_ACTIVATIONS.has(type)) return true;
  const name = normalize(item?.name || "");
  return name.includes("recover sorcery") || name.includes("regain sorcery");
}

/**
 * One button for a feature family. Every shell and "Family: …" option hangs off it.
 * @param {{ id: string, name: string, key: string }} family
 * @param {Item[]} shells
 * @param {Item|null} parent
 * @param {Item[]} childItems
 * @param {"action"|"bonus"|"reaction"} activation
 */
function buildFamilyLeaf(family, shells, parent, childItems, activation) {
  if (!parent && !childItems.length) return null;
  if (familyButtonRing(parent, shells) !== activation) return null;

  const activities = [];
  for (const shell of shells) {
    for (const activity of combatActivities(shell)) {
      if (activity && !activity.item && !activity.parent) activity.item = shell;
      activities.push(activity);
    }
  }

  const modes = familyModeActivities(activities, childItems.length > 0, family);
  const hasNest = childItems.length > 0 || modes.length > 1;
  const host = parent ?? syntheticFamilyParent(family, childItems);
  const primary = modes[0] ?? firstCombatActivity(host);
  const anyModes = modes.length > 0 || childItems.length > 0;
  if (!anyModes && !shells.some(shell => featureMatchesActivation(shell, activation))) {
    return null;
  }

  const leaf = makeLeaf({
    item: host,
    activity: hasNest ? null : primary,
    hasNest,
    nestActivities: hasNest ? modes : (primary ? [primary] : []),
    childItems,
    available: canAttemptUse(hasNest ? null : primary, primary?.item ?? host),
    activation,
    usesLabel: formatUses(host, null)
  });
  return {
    ...leaf,
    featureFamily: family,
    channelDivinity: family.id === "channel-divinity"
  };
}

/**
 * The uses-pool button stays on the ring that matches the Channel Divinity shell.
 * Individual divinities may be actions or bonus actions; they still list under that button.
 * @param {Item|null} parent
 * @param {Item[]} shells
 * @returns {"action"|"bonus"|"reaction"}
 */
function familyButtonRing(parent, shells) {
  const host = parent ?? shells[0] ?? null;
  if (!host) return "action";
  const action = featureMatchesActivation(host, "action");
  const bonus = featureMatchesActivation(host, "bonus");
  const reaction = featureMatchesActivation(host, "reaction");
  if (bonus && !action) return "bonus";
  if (reaction && !action && !bonus) return "reaction";
  return "action";
}

/**
 * Nest titles come from the feature name, not a generic "Metamagic" or "Channel Divinity" activity.
 * @param {object} featureOption
 * @returns {Array<object>}
 */
function familyModes(featureOption) {
  const family = featureOption.featureFamily
    ?? FEATURE_FAMILIES.find(entry => entry.id === "channel-divinity");
  const fromItems = (featureOption.childItems ?? []).map(item => {
    const activity = firstCombatActivity(item);
    const name = familyOptionLabel(item.name, family);
    const available = canAttemptUse(activity, item);
    return {
      id: `${featureOption.id}:item:${item.id}`,
      kind: "feature-mode",
      name,
      img: preferDocumentImg(itemArtwork(item, activity), featureOption.img),
      item,
      activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(activity, item),
      parentFeatureId: featureOption.id,
      usesLabel: formatUses(item, activity),
      tooltip: describedTooltip(item, activity, name)
    };
  });

  const titles = new Set(fromItems.map(mode => normalize(mode.name)));
  const fromActivities = (featureOption.nestActivities ?? []).flatMap((activity, index) => {
    const name = familyOptionLabel(activity?.name || "", family);
    const key = normalize(name);
    if (!key || key === family.key || titles.has(key)) return [];
    titles.add(key);
    const item = activity?.item ?? activity?.parent ?? featureOption.item;
    const available = canAttemptUse(activity, item);
    return [{
      id: `${featureOption.id}:mode:${activity.id ?? activity._id ?? index}`,
      kind: "feature-mode",
      name,
      img: preferDocumentImg(activityArtwork(item, activity), featureOption.img),
      item,
      activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(activity, item),
      parentFeatureId: featureOption.id,
      usesLabel: formatUses(item, activity),
      tooltip: describedTooltip(item, activity, name)
    }];
  });

  return [...fromActivities, ...fromItems];
}

/**
 * Hover card: the ability or item description from the sheet.
 * A nest hint is only used when that description is empty.
 * @param {Item} item
 * @param {object|null|undefined} activity
 * @param {string} title
 * @param {{ hasNest?: boolean }} [opts]
 */
function describedTooltip(item, activity, title, opts = {}) {
  const uses = formatUses(item, activity);
  return sheetItemTooltip(item, {
    title: title || item?.name || "",
    activity,
    note: uses ? t("Features.UsesRemaining", { uses }) : "",
    fallback: opts.hasNest ? t("Features.OpenModesHint") : t("Features.ClassFeatureHint")
  });
}

/**
 * First activity a feature can actually use in combat.
 * @param {Item} item
 * @returns {object|null}
 */
function firstCombatActivity(item) {
  const activities = combatActivities(item);
  return activities[0] ?? null;
}

/**
 * Combat activities on a Channel Divinity shell, action and bonus alike.
 * @param {Item} item
 * @returns {object[]}
 */
function combatActivities(item) {
  const activities = getActivities(item);
  return activities.filter(activity => {
    if (isRestOnlyActivity(activity, item)) return false;
    if (isAttackActivity(activity) && activities.length > 1) return false;
    const type = String(getActivationType(activity, item) ?? "").toLowerCase().trim();
    if (NON_COMBAT_ACTIVATIONS.has(type)) return false;
    return true;
  });
}

function usableActivities(item, activation) {
  const { matching } = activationMatch(item, activation);
  return matching.filter(activity => !isAttackActivity(activity) || matching.length === 1);
}

/**
 * Prefer the shell that actually holds the uses pool (the "2/2" button).
 * @param {Item[]} shells
 * @returns {Item|null}
 */
function pickFamilyParent(shells) {
  if (!shells.length) return null;
  return [...shells].sort((a, b) => channelPoolScore(b) - channelPoolScore(a))[0];
}

function channelPoolScore(item) {
  const uses = item?.system?.uses;
  if (!uses) return 0;
  const max = Number(uses.max);
  if (Number.isFinite(max) && max > 0) return 100 + max;
  if (typeof uses.max === "string" && uses.max.trim()) return 50;
  if (uses.spent != null || uses.value != null) return 10;
  return 0;
}

/**
 * The uses-pool feature, not an individual option.
 * @param {Item} item
 * @param {{ key: string }} family
 */
function isFamilyParent(item, family) {
  return normalize(item?.name) === family.key
    || normalize(item?.system?.identifier) === family.key;
}

/**
 * A separate feat that is one option (e.g. "Metamagic: Twinned Spell").
 * @param {Item} item
 * @param {Item|null} parent
 * @param {{ id: string, name: string, key: string, subtype: string }} family
 */
function isFamilyOption(item, parent, family) {
  if (!item || item.type !== "feat") return false;
  if (parent && item.id === parent.id) return false;
  if (isFamilyParent(item, family)) return false;

  if (hasFamilySeparator(item.name, family) || hasFamilySeparator(item.system?.identifier, family)) {
    return true;
  }

  const name = normalize(item.name);
  const ident = normalize(item.system?.identifier);
  // "Channel Divinity: …" stays an option after punctuation is normalized away.
  if (family.id === "channel-divinity"
    && (name.startsWith(`${family.key} `) || ident.startsWith(`${family.key} `))) {
    return true;
  }

  const subtype = String(item.system?.type?.subtype ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (subtype && subtype === family.subtype) return true;

  return !!(parent && consumesItem(item, parent));
}

/**
 * "Metamagic: Twinned Spell" is an option. "Metamagic Adept" is not.
 * @param {string|undefined} value
 * @param {{ name: string }} family
 */
function hasFamilySeparator(value, family) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const pattern = new RegExp(`^${escapeRegExp(family.name)}\\s*[:\\-–—]\\s*\\S`, "i");
  return pattern.test(raw);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Drop a generic family activity once real options exist.
 * @param {object[]} usable
 * @param {boolean} hasChildren
 * @param {{ key: string }} family
 */
function familyModeActivities(usable, hasChildren, family) {
  const specific = usable.filter(activity => normalize(activity?.name) !== family.key);
  const source = (hasChildren || specific.length) ? specific : usable;
  const seen = new Set();
  const unique = [];
  for (const activity of source) {
    const key = normalize(activity?.name) || String(activity?.id ?? activity?._id ?? unique.length);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(activity);
  }
  return unique;
}

function syntheticFamilyParent(family, children) {
  return {
    id: family.id,
    name: family.name,
    type: "feat",
    img: children.find(child => child.img)?.img || "",
    system: { identifier: family.id, uses: children[0]?.system?.uses ?? null }
  };
}

function familyOptionLabel(name, family) {
  const pattern = new RegExp(`^${escapeRegExp(family.name)}\\s*[:\\-–—]?\\s*`, "i");
  const stripped = String(name ?? "").replace(pattern, "").trim();
  return stripped || String(name ?? family.name);
}

function featureMatchesActivation(item, activation) {
  const { matching, legacyMatch } = activationMatch(item, activation);
  if (legacyMatch) return true;
  const usable = matching.filter(activity => !isAttackActivity(activity) || matching.length === 1);
  return usable.length > 0;
}

function activationMatch(item, activation) {
  const allActivities = getActivities(item);
  const matching = allActivities.filter(activity =>
    matchesActivation(getActivationType(activity, item), activation)
    && !isRestOnlyActivity(activity, item)
  );
  const legacyType = item.system?.activation?.type ?? "";
  const legacyMatch = !allActivities.length
    && matchesActivation(legacyType, activation)
    && !isRestOnlyItem(item);
  return { matching, legacyMatch };
}

function primaryActivity(item, activation) {
  const { matching } = activationMatch(item, activation);
  const usable = matching.filter(activity => !isAttackActivity(activity) || matching.length === 1);
  return usable[0] ?? null;
}

function consumesItem(item, parent) {
  const ids = [parent.id, parent.uuid, parent.system?.identifier]
    .filter(Boolean)
    .map(value => String(value));
  if (!ids.length) return false;

  for (const activity of getActivities(item)) {
    const targets = activity?.consumption?.targets ?? [];
    const list = Array.isArray(targets) ? targets : Object.values(targets ?? {});
    for (const target of list) {
      const ref = String(target?.target ?? target?.value ?? "");
      if (ids.some(id => ref.includes(id))) return true;
    }
  }
  return false;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * @param {Item} item
 * @param {object|null} activity
 * @returns {string|null}
 */
export function formatUses(item, activity) {
  const actor = item?.actor ?? activity?.item?.actor ?? activity?.actor ?? null;
  const itemLabel = readUses(item?.system?.uses, actor);
  const activityLabel = readUses(activity?.uses, actor);

  // Lay on Hands and similar features spend the item pool. The activity's own
  // uses field is often an empty counter prepared as 0.
  if (spendsItemUses(activity) && itemLabel) return itemLabel;
  if (activityLabel) return activityLabel;
  if (itemLabel) return itemLabel;
  return null;
}

/**
 * Remaining/max for a dnd5e uses block.
 * 3.x stores `value`. 4.x/5.x stores `spent` and a `max` formula (`max - spent` remaining).
 * @param {object|null|undefined} uses
 * @param {Actor|null} actor
 * @returns {string|null}
 */
function readUses(uses, actor) {
  if (!uses) return null;
  const max = resolveUsesMax(uses.max, actor);
  if (max == null || max <= 0) return null;

  const spent = coerceNum(uses.spent);
  const value = coerceNum(uses.value);
  const remaining = spent != null
    ? Math.max(0, max - spent)
    : (value != null ? value : max);
  return `${remaining}/${max}`;
}

/**
 * @param {number|string|null|undefined} raw
 * @param {Actor|null} actor
 * @returns {number|null}
 */
function resolveUsesMax(raw, actor) {
  const direct = coerceNum(raw);
  if (direct != null) return direct;
  if (typeof raw !== "string" || !raw.trim()) return null;

  const rollData = actor?.getRollData?.() ?? {};
  const resolvers = [
    globalThis.dnd5e?.utils?.simplifyBonus,
    globalThis.simplifyBonus
  ];
  for (const fn of resolvers) {
    if (typeof fn !== "function") continue;
    try {
      const n = coerceNum(fn(raw, rollData));
      if (n != null) return n;
    } catch (_) {
      /* try the next resolver */
    }
  }

  let expr = raw;
  try {
    if (typeof Roll !== "undefined" && typeof Roll.replaceFormulaData === "function") {
      expr = Roll.replaceFormulaData(raw, rollData);
    } else {
      expr = raw.replace(/@([a-zA-Z0-9_.]+)/g, (_match, path) => {
        let cur = rollData;
        for (const part of path.split(".")) {
          if (cur == null) return "0";
          cur = cur[part];
        }
        const n = Number(cur);
        return Number.isFinite(n) ? String(n) : "0";
      });
    }
    if (typeof Roll !== "undefined" && typeof Roll.safeEval === "function") {
      const n = coerceNum(Roll.safeEval(expr));
      if (n != null) return n;
    }
  } catch (_) {
    /* fall through to arithmetic */
  }

  const cleaned = String(expr).replace(/\s+/g, "");
  if (!/^[\d.+\-*/()]+$/.test(cleaned)) return null;
  try {
    const n = Function(`"use strict"; return (${cleaned})`)();
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

function spendsItemUses(activity) {
  const targets = activity?.consumption?.targets ?? [];
  const list = Array.isArray(targets) ? targets : Object.values(targets ?? {});
  return list.some(target => target?.type === "itemUses");
}

function coerceNum(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

