import { getActivationType, getSpellLevels, t } from "./actor-options.mjs";
import { getSelectedTargetUuids } from "./permissions.mjs";

function hasWarCaster(actor) {
  return Array.from(actor?.items ?? []).some(item => item.type === "feat" &&
    [item.system?.identifier, item.name].some(value =>
      /^warcaster(?:legacy|2014|2024)?$/i.test(String(value ?? "").replace(/[^a-z0-9]/gi, ""))));
}

function isSingleTargetActionSpell({ item, activity }) {
  if (!activity?.id || (activity.item && activity.item !== item)) return false;
  if (getActivationType(activity, item) !== "action") return false;
  const cost = activity.activation?.value ?? item.system?.activation?.value ?? 1;
  if (Number(cost) !== 1) return false;
  const target = activity.target ?? item.system?.target;
  if (target?.template?.type) return false;
  const type = target?.affects?.type ?? target?.type;
  const count = target?.affects?.count ?? target?.value;
  return ["creature", "creatureOrObject", "enemy", "ally", "any", "willing"].includes(type)
    && Number(count) === 1;
}

export function getWarCasterSpellOptions(actor) {
  if (!hasWarCaster(actor)) return [];
  return getSpellLevels(actor, "action").levels.flatMap(level => level.spells)
    .filter(spell => spell.available && isSingleTargetActionSpell(spell))
    .map(spell => ({
      ...spell,
      id: `war-caster:${spell.item.id}`,
      kind: "war-caster-spell",
      name: t("Opportunity.WarCasterSpell", { spell: spell.name }),
      requiresTarget: true
    }));
}

export async function castWarCasterSpell(option, actor) {
  const spell = getWarCasterSpellOptions(actor).find(entry =>
    entry.item.uuid === option.item?.uuid && entry.activity.id === option.activity?.id);
  if (!spell) throw new Error(t("Notify.Unavailable"));
  const targetUuids = option.targetUuids ?? getSelectedTargetUuids();
  const target = Array.isArray(targetUuids) && targetUuids.length === 1 ? await fromUuid(targetUuids[0]) : null;
  if (target?.documentName !== "Token" || !target.actor || target.actor.uuid === actor.uuid) {
    ui.notifications.warn(t("Opportunity.WarCasterTarget"));
    return false;
  }

  // Use a temporary reaction copy so the sheet spell stays an action and its normal costs still apply.
  const activation = { type: "reaction", value: 1, condition: "" };
  const item = await spell.item.clone({
    system: { activation, activities: { [spell.activity.id]: { activation: { ...activation, override: true } } } }
  }, { keepId: true, parent: actor });
  const activity = item.system.activities.get(spell.activity.id);
  if (getActivationType(activity, item) !== "reaction" || typeof activity?.use !== "function") {
    throw new Error(t("Notify.Unavailable"));
  }

  const dialog = { configure: true };
  const midi = globalThis.MidiQOL;
  if (game.modules?.get("midi-qol")?.active && typeof midi?.completeActivityUse === "function") {
    return midi.completeActivityUse(activity, {
      midiOptions: { targetUuids, ignoreUserTargets: true, proceedChecks: { checkAoO: false } }
    }, dialog, { create: true });
  }
  const targets = [{
    actor: target.actor.uuid, token: target.uuid, name: target.name,
    img: target.texture?.src ?? target.actor.img,
    ac: target.actor.statuses?.has("coverTotal") ? null : target.actor.system?.attributes?.ac?.value ?? null
  }];
  return activity.use({}, dialog, { create: true, data: { system: { targets } } });
}
