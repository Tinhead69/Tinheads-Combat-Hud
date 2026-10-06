/**
 * Actor / item / activity helpers for Tinhead's Combat Hud.
 * Keeps dnd5e data shaping out of the radial UI.
 */

const MODULE_ID = "tinheads-combat-hud";

/**
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function t(key, data) {
  return game.i18n.format(`TINHEADS_COMBAT_HUD.${key}`, data ?? {});
}

/**
 * @param {TokenDocument|Token} tokenLike
 * @returns {Actor|null}
 */
export function actorFromToken(tokenLike) {
  const doc = tokenLike?.document ?? tokenLike;
  const actor = doc?.actor ?? tokenLike?.actor ?? null;
  return actor ?? null;
}

export { canOpenHud, canUseActor, canResolveLocally } from "./permissions.mjs";

/**
 * Resolve a favorite id (relative UUID / activity path) against an actor.
 * @param {Actor} actor
 * @param {string} favoriteId
 * @returns {Document|object|null}
 */
function resolveFavoriteRef(actor, favoriteId) {
  if (!favoriteId) return null;
  try {
    if (typeof fromUuidSync === "function") {
      const resolved = fromUuidSync(favoriteId, { relative: actor });
      if (resolved) return resolved;
    }
  } catch (_) {
    /* fall through */
  }

  // Relative item id forms: ".Item.<id>" / "Item.<id>" / ".<id>"
  const itemMatch = favoriteId.match(/(?:^|\.)Item\.([A-Za-z0-9]+)$/);
  if (itemMatch) return actor.items.get(itemMatch[1]) ?? null;

  const bare = favoriteId.startsWith(".") ? favoriteId.slice(1) : favoriteId;
  if (actor.items?.get(bare)) return actor.items.get(bare);

  // Activity favorites: "...Item.<id>.Activity.<activityId>"
  const activityMatch = favoriteId.match(/Item\.([A-Za-z0-9]+)\.Activity\.([A-Za-z0-9]+)/);
  if (activityMatch) {
    const item = actor.items.get(activityMatch[1]);
    const activity = item?.system?.activities?.get?.(activityMatch[2])
      ?? item?.system?.activities?.[activityMatch[2]];
    if (activity) return activity;
  }

  return null;
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function isWeaponItem(item) {
  return item?.type === "weapon";
}

/**
 * Prefer primary attack activity; fall back to first usable activity / item.
 * @param {Item} item
 * @returns {{ item: Item, activity: object|null }}
 */
export function getAttackHandle(item) {
  const activities = getActivities(item);
  const attack = activities.find(a => a.type === "attack")
    ?? activities.find(a => a.attack)
    ?? activities[0]
    ?? null;
  return { item, activity: attack };
}

/**
 * @param {Item} item
 * @returns {object[]}
 */
export function getActivities(item) {
  const collection = item?.system?.activities;
  if (!collection) return [];
  if (typeof collection === "object" && typeof collection[Symbol.iterator] === "function") {
    return Array.from(collection);
  }
  if (typeof collection.values === "function") return Array.from(collection.values());
  if (typeof collection === "object") return Object.values(collection);
  return [];
}

/**
 * @param {object|null} activity
 * @param {Item} [item]
 * @returns {string}
 */
export function getActivationType(activity, item) {
  const fromActivity = activity?.activation?.type
    ?? activity?.system?.activation?.type
    ?? "";
  if (fromActivity) return fromActivity;
  return item?.system?.activation?.type ?? "";
}

/**
 * Favorited weapons for the Action ring.
 * @param {Actor} actor
 * @returns {Array<{ id: string, name: string, img: string, item: Item, activity: object|null, available: boolean, reason?: string }>}
 */
export function getFavoritedWeapons(actor) {
  const favorites = foundry.utils.duplicate(actor.system?.favorites ?? []);
  favorites.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const weapons = [];
  const seen = new Set();

  for (const fav of favorites) {
    if (fav.type && !["item", "activity"].includes(fav.type)) continue;
    const ref = resolveFavoriteRef(actor, fav.id);
    if (!ref) continue;

    let item = null;
    let activity = null;

    // Activity favorites expose `.item`; item favorites are Item documents.
    if (ref.item && !isWeaponItem(ref) && (ref.type || ref.activation || ref.use)) {
      activity = ref;
      item = ref.item;
    } else if (isWeaponItem(ref)) {
      item = ref;
    } else if (ref.item && isWeaponItem(ref.item)) {
      activity = ref;
      item = ref.item;
    }

    if (!item || !isWeaponItem(item)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const handle = activity ? { item, activity } : getAttackHandle(item);
    const available = canAttemptUse(handle.activity, handle.item);
    weapons.push({
      id: `weapon:${item.id}`,
      name: item.name,
      img: item.img || getDefaultIcon("weapon"),
      item: handle.item,
      activity: handle.activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(handle.activity, handle.item)
    });
  }

  return weapons;
}

/**
 * Prefer document artwork (`item.img`); Foundry/system defaults only when missing.
 * Module chrome SVGs are NOT used here — see module-icons.mjs for HUD chrome only.
 * @param {string} kind
 * @returns {string}
 */
export function getDefaultIcon(kind = "item") {
  const defaults = CONFIG?.DND5E?.defaultArtwork?.Item;
  if (defaults?.[kind]) return defaults[kind];
  if (defaults?.weapon) return defaults.weapon;
  return "icons/svg/sword.svg";
}

/**
 * Castable spells grouped by **available** spell levels only.
 * Section count for the spell-level ring = `levels.length` (never a fixed 0–9 ring).
 * A level appears only when the actor has ≥1 HUD-usable spell at that level.
 *
 * @param {Actor} actor
 * @returns {{ levels: Array<{ level: number, label: string, spells: object[] }>, empty: boolean }}
 */
export function getSpellLevels(actor) {
  const byLevel = new Map();

  for (const item of actor.items ?? []) {
    if (item.type !== "spell") continue;
    if (!isSpellAvailableForHud(actor, item)) continue;

    const level = Number(item.system?.level ?? 0);
    if (!byLevel.has(level)) byLevel.set(level, []);

    const cast = getCastActivity(item);
    const available = canAttemptUse(cast, item);
    byLevel.get(level).push({
      id: `spell:${item.id}`,
      name: item.name,
      img: item.img || getDefaultIcon("spell"),
      item,
      activity: cast,
      level,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(cast, item),
      tooltip: buildSpellTooltipData(item, cast)
    });
  }

  // Only levels that actually have spells — UI lays them on a partial arc via arcSegmentsForParent.
  const levels = Array.from(byLevel.keys())
    .sort((a, b) => a - b)
    .map(level => ({
      level,
      label: spellLevelLabel(level),
      spells: byLevel.get(level).sort((a, b) => a.name.localeCompare(b.name))
    }))
    .filter(entry => entry.spells.length > 0);

  return { levels, empty: levels.length === 0 };
}

/**
 * @param {number} level
 * @returns {string}
 */
function spellLevelLabel(level) {
  const key = `SpellLevels.${level}`;
  const localized = t(key);
  if (localized && localized !== `TINHEADS_COMBAT_HUD.${key}`) return localized;
  if (level === 0) return "Cantrip";
  if (level === 1) return "1st";
  if (level === 2) return "2nd";
  if (level === 3) return "3rd";
  return `${level}th`;
}

/**
 * Whether a spell should contribute to the Cast Spell level ring / spell ring.
 * Cantrips: known spells always count.
 * Leveled: must pass prep/known rules and have a usable slot source (or be at-will/innate).
 *
 * @param {Actor} actor
 * @param {Item} item
 * @returns {boolean}
 */
export function isSpellAvailableForHud(actor, item) {
  if (!item || item.type !== "spell") return false;

  const level = Number(item.system?.level ?? 0);
  const mode = item.system?.preparation?.mode || "prepared";
  const prepared = item.system?.preparation?.prepared;

  // Cantrips never consume slots
  if (level === 0) return true;

  // At-will / innate: no slot gate
  if (mode === "atwill" || mode === "innate") return true;

  // Prepared casters: skip unprepared spells entirely (do not create empty/grey levels for them)
  if (mode === "prepared" && prepared === false) return false;

  // Pact magic
  if (mode === "pact") return hasPactSlots(actor);

  // always / prepared / default known casters: need a slot at this level (or higher upcast source)
  return hasSpellSlotForLevel(actor, level);
}

/**
 * @param {Actor} actor
 * @param {number} level
 * @returns {boolean}
 */
export function hasSpellSlotForLevel(actor, level) {
  if (level <= 0) return true;
  const spells = actor?.system?.spells;
  if (!spells) {
    // No slot data (NPC / incomplete) — allow listing known/prepared spells; dnd5e enforces on use().
    return true;
  }

  const slot = spells[`spell${level}`];
  if (slot && Number(slot.max ?? 0) > 0) return true;

  // Higher-level slots can cast lower-level spells; if any higher max exists, include the level.
  for (let n = level + 1; n <= 9; n++) {
    const higher = spells[`spell${n}`];
    if (higher && Number(higher.max ?? 0) > 0) return true;
  }

  // Pact slot usable for this spell level
  if (hasPactSlots(actor) && Number(spells.pact?.level ?? 0) >= level) return true;

  return false;
}

/**
 * @param {Actor} actor
 * @returns {boolean}
 */
function hasPactSlots(actor) {
  const pact = actor?.system?.spells?.pact;
  return !!pact && Number(pact.max ?? 0) > 0;
}

/**
 * @param {Item} item
 * @returns {object|null}
 */
export function getCastActivity(item) {
  const activities = getActivities(item);
  return activities.find(a => a.type === "cast" || a.type === "utility" || a.type === "save" || a.type === "attack" || a.type === "heal" || a.type === "damage")
    ?? activities[0]
    ?? null;
}

/**
 * Bonus Action / Reaction leaf options from matching activities (or legacy activation).
 * @param {Actor} actor
 * @param {"bonus"|"reaction"} activation
 * @returns {Array<object>}
 */
export function getActivationOptions(actor, activation) {
  const options = [];
  const seen = new Set();

  for (const item of actor.items ?? []) {
    // Class feats are grouped/nested via getClassFeatureOptions (activation-aware).
    if (item.type === "feat") continue;

    const activities = getActivities(item);
    if (activities.length) {
      for (const activity of activities) {
        if (getActivationType(activity, item) !== activation) continue;
        const key = `${item.id}:${activity.id ?? activity._id ?? activity.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const available = canAttemptUse(activity, item);
        options.push({
          id: `act:${key}`,
          name: activity.name || item.name,
          img: activity.img || item.img || getDefaultIcon(item.type),
          item,
          activity,
          available: available.ok,
          reason: available.reason,
          requiresTarget: optionRequiresTarget(activity, item)
        });
      }
    } else if ((item.system?.activation?.type ?? "") === activation) {
      const key = `item:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const available = canAttemptUse(null, item);
      options.push({
        id: key,
        name: item.name,
        img: item.img || getDefaultIcon(item.type),
        item,
        activity: null,
        available: available.ok,
        reason: available.reason,
        requiresTarget: optionRequiresTarget(null, item)
      });
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {object|null} activity
 * @param {Item} item
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canAttemptUse(activity, item) {
  if (!item) return { ok: false, reason: t("Notify.Unavailable") };
  // OBSERVER may browse/proxy; OWNER/GM execute. Block only true limited viewers.
  if (!item.isOwner && !game.user?.isGM) {
    const actor = item.actor;
    const observer = !!(
      actor?.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
      || actor?.testUserPermission?.(game.user, "OBSERVER")
    );
    if (!observer) {
      return { ok: false, reason: t("Notify.Unavailable") };
    }
  }
  if (activity && activity.canUse === false) {
    return { ok: false, reason: t("Notify.Unavailable") };
  }
  // Prepared spells with preparation.value === false
  if (item.type === "spell") {
    const mode = item.system?.preparation?.mode;
    const prepared = item.system?.preparation?.prepared;
    if (mode === "prepared" && prepared === false) {
      return { ok: false, reason: "Spell is not prepared." };
    }
  }
  return { ok: true };
}

/**
 * @param {object|null} activity
 * @param {Item} item
 * @returns {boolean}
 */
export function optionRequiresTarget(activity, item) {
  const target = activity?.target ?? item?.system?.target;
  if (!target) {
    // Attack activities / weapons typically need a target
    if (activity?.type === "attack" || item?.type === "weapon") return true;
    return false;
  }

  const affectsType = target.affects?.type ?? target.type ?? "";
  const templateType = target.template?.type ?? "";
  if (affectsType === "self" || affectsType === "") {
    if (activity?.type === "attack" || item?.type === "weapon") return true;
    // AoE template spells often place a template rather than needing a token target
    if (templateType) return false;
    return false;
  }
  if (["creature", "enemy", "ally", "object", "any"].includes(affectsType)) return true;
  if (target.value && !templateType) return true;
  if (activity?.type === "attack" || item?.type === "weapon") return true;
  return false;
}

/**
 * Spell tooltip fields for the spell ring.
 * @param {Item} item
 * @param {object|null} activity
 */
export function buildSpellTooltipData(item, activity) {
  const description = extractDescription(item);
  const targets = formatTargets(activity, item);
  const range = formatRange(activity, item);
  const duration = formatDuration(activity, item);
  const damage = formatDamage(activity, item);

  return {
    title: item.name,
    description,
    targets,
    range,
    duration,
    damage
  };
}

function extractDescription(item) {
  const raw = item.system?.description?.value
    ?? item.system?.description
    ?? "";
  if (!raw) return t("Tooltip.NoDescription");
  const text = typeof raw === "string"
    ? raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : String(raw);
  if (!text) return t("Tooltip.NoDescription");
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

function formatTargets(activity, item) {
  const target = activity?.target ?? item?.system?.target;
  if (!target) return t("Tooltip.EmDash");

  const parts = [];
  const affects = target.affects ?? {};
  const template = target.template ?? {};

  if (affects.type) {
    const count = affects.count || affects.value || target.value;
    parts.push(count ? `${count} ${affects.type}` : String(affects.type));
  } else if (target.type) {
    const count = target.value;
    parts.push(count ? `${count} ${target.type}` : String(target.type));
  }

  if (template.type) {
    const size = template.size || template.value;
    parts.push(size ? `${size}${template.units ? ` ${template.units}` : ""} ${template.type}` : template.type);
  }

  return parts.length ? parts.join(" · ") : t("Tooltip.EmDash");
}

function formatRange(activity, item) {
  const range = activity?.range ?? item?.system?.range;
  if (!range) return t("Tooltip.EmDash");
  if (range.units === "self") return "Self";
  if (range.units === "touch") return "Touch";
  const value = range.value ?? range.reach;
  const units = range.units ?? "";
  if (value == null || value === "") return units || t("Tooltip.EmDash");
  return `${value} ${units}`.trim();
}

function formatDuration(activity, item) {
  const duration = activity?.duration ?? item?.system?.duration;
  if (!duration) return "Instant";
  if (!duration.units || duration.units === "inst") return "Instant";
  const value = duration.value;
  return value != null && value !== ""
    ? `${value} ${duration.units}`
    : String(duration.units);
}

function formatDamage(activity, item) {
  const parts = [];

  const activityParts = activity?.damage?.parts;
  if (Array.isArray(activityParts) && activityParts.length) {
    for (const part of activityParts) {
      // 4.x parts may be objects { number, denomination, types } or legacy [formula, type]
      if (Array.isArray(part)) {
        const [formula, type] = part;
        parts.push(type ? `${formula} ${type}` : String(formula));
      } else if (part && typeof part === "object") {
        const formula = part.custom?.formula
          || (part.number != null && part.denomination != null ? `${part.number}d${part.denomination}` : part.formula)
          || "";
        const types = Array.isArray(part.types)
          ? Array.from(part.types).join(", ")
          : (part.type ?? "");
        if (formula) parts.push(types ? `${formula} ${types}` : formula);
      }
    }
  }

  const legacy = item?.system?.damage?.parts;
  if (!parts.length && Array.isArray(legacy)) {
    for (const [formula, type] of legacy) {
      parts.push(type ? `${formula} ${type}` : String(formula));
    }
  }

  return parts.length ? parts.join(" + ") : null;
}

export { MODULE_ID };
