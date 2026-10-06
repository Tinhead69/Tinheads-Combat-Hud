/**
 * Classify weapon activities into Attack vs special abilities (e.g. Cube of Force modes).
 * Reads dnd5e item activities — no Wave-specific hardcoding.
 */

import {
  canAttemptUse,
  getActivities,
  getDefaultIcon,
  optionRequiresTarget,
  t
} from "./actor-options.mjs";
import { CHROME, preferDocumentImg } from "./module-icons.mjs";

/**
 * @param {object} activity
 * @returns {boolean}
 */
export function isAttackActivity(activity) {
  if (!activity) return false;
  if (activity.type === "attack") return true;
  if (activity.attack) return true;
  return false;
}

/**
 * @param {Item} item
 * @returns {{
 *   attacks: object[],
 *   specials: object[],
 *   hasSpecial: boolean,
 *   primaryAttack: object|null
 * }}
 */
export function getWeaponActivityGroups(item) {
  const activities = getActivities(item);
  const attacks = [];
  const specials = [];

  for (const activity of activities) {
    if (isAttackActivity(activity)) attacks.push(activity);
    else specials.push(activity);
  }

  return {
    attacks,
    specials,
    hasSpecial: specials.length > 0,
    primaryAttack: attacks[0] ?? null
  };
}

/**
 * Enrich a favorited-weapon option with special-ability metadata.
 * @param {object} weaponOption from getFavoritedWeapons
 */
export function enrichWeaponOption(weaponOption) {
  const item = weaponOption.item;
  const groups = getWeaponActivityGroups(item);
  const attack = groups.primaryAttack ?? weaponOption.activity;
  const available = canAttemptUse(attack, item);

  return {
    ...weaponOption,
    kind: "weapon",
    activity: attack,
    hasSpecial: groups.hasSpecial,
    attackActivities: groups.attacks,
    specialActivities: groups.specials,
    available: available.ok,
    reason: available.reason,
    requiresTarget: optionRequiresTarget(attack, item)
  };
}

/**
 * Leaf options for Attack / Use Ability nest under a special weapon.
 * @param {object} weaponOption enriched weapon
 */
export function getWeaponMenuOptions(weaponOption) {
  const attack = weaponOption.activity
    ?? weaponOption.attackActivities?.[0]
    ?? null;
  const attackAvail = canAttemptUse(attack, weaponOption.item);

  return [
    {
      id: `${weaponOption.id}:attack`,
      kind: "weapon-attack",
      name: t("WeaponNest.Attack"),
      img: preferDocumentImg(weaponOption.img, getDefaultIcon("weapon")),
      item: weaponOption.item,
      activity: attack,
      available: attackAvail.ok,
      reason: attackAvail.reason,
      requiresTarget: optionRequiresTarget(attack, weaponOption.item),
      parentWeaponId: weaponOption.id,
      tooltip: {
        title: t("WeaponNest.Attack"),
        description: t("WeaponNest.AttackHint")
      }
    },
    {
      id: `${weaponOption.id}:use-ability`,
      kind: "weapon-use-ability",
      name: t("WeaponNest.UseAbility"),
      img: CHROME.useAbility,
      item: weaponOption.item,
      activity: null,
      available: weaponOption.specialActivities?.length > 0,
      reason: weaponOption.specialActivities?.length ? null : t("Empty.NoWeaponAbilities"),
      requiresTarget: false,
      parentWeaponId: weaponOption.id,
      isNest: true,
      tooltip: {
        title: t("WeaponNest.UseAbility"),
        description: t("WeaponNest.UseAbilityHint")
      }
    }
  ];
}

/**
 * Ability mode leaves under Use Ability (Cube of Force modes, etc.).
 * @param {object} weaponOption enriched weapon
 */
export function getWeaponAbilityOptions(weaponOption) {
  const specials = weaponOption.specialActivities ?? [];
  return specials.map((activity, index) => {
    const available = canAttemptUse(activity, weaponOption.item);
    return {
      id: `${weaponOption.id}:ability:${activity.id ?? activity._id ?? index}`,
      kind: "weapon-ability",
      name: activity.name || t("WeaponNest.AbilityFallback"),
      img: preferDocumentImg(
        activity.img || weaponOption.img,
        getDefaultIcon("feat")
      ),
      item: weaponOption.item,
      activity,
      available: available.ok,
      reason: available.reason,
      requiresTarget: optionRequiresTarget(activity, weaponOption.item),
      parentWeaponId: weaponOption.id,
      tooltip: {
        title: activity.name || weaponOption.name,
        description: t("WeaponNest.AbilityHint")
      }
    };
  });
}
