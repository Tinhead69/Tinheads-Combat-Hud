/**
 * Resolve HUD leaf clicks through dnd5e activity/item use(),
 * ability rolls, or module-backed basic Action chat cards.
 * Non-owners proxy via socketlib → GM executeAsGM.
 */

import {
  optionRequiresTarget,
  t
} from "./actor-options.mjs";
import {
  canResolveLocally,
  getSelectedTargetUuids,
  shouldResolveLocally,
  socketlibModuleActive
} from "./permissions.mjs";
import { rollAbilityHudOption } from "./ability-checks.mjs";
import { grantDashMovement } from "./dash-movement.mjs";

/**
 * @param {object} option
 * @param {{ actor?: Actor }} [ctx]
 * @returns {Promise<{ closed: boolean, ok: boolean }>}
 */
export async function resolveHudOption(option, ctx = {}) {
  if (!option) {
    ui.notifications.warn(t("Notify.Unavailable"));
    return { closed: false, ok: false };
  }

  if (option.available === false) {
    ui.notifications.warn(option.reason || t("Notify.Unavailable"));
    return { closed: false, ok: false };
  }

  const actor = ctx.actor
    ?? option.actor
    ?? option.item?.actor
    ?? null;

  const local = shouldResolveLocally(actor) || canResolveLocally(actor);

  if (!local) {
    if (!socketlibModuleActive()) {
      ui.notifications.warn(t("Proxy.SocketlibMissing"));
      return { closed: false, ok: false };
    }
    try {
      const { isSocketReady, requestRemoteResolve } = await import("../net/socket.mjs");
      if (!isSocketReady()) {
        ui.notifications.warn(t("Proxy.SocketlibMissing"));
        return { closed: false, ok: false };
      }
      const payload = serializeResolveOption(option, actor);
      const remote = await requestRemoteResolve(payload);
      if (!remote?.ok && remote?.error) {
        ui.notifications.warn(remote.error);
      }
      return { closed: remote?.closed !== false, ok: !!remote?.ok };
    } catch (err) {
      console.error("Tinhead's Combat Hud | proxy resolve failed", err);
      ui.notifications.error(err?.message || t("Proxy.RequestFailed"));
      return { closed: true, ok: false };
    }
  }

  try {
    if (option.kind === "ability-check" || option.kind === "ability-save" || option.kind === "skill-check" || option.kind === "death-save") {
      await rollAbilityHudOption(actor, option);
      return { closed: true, ok: true };
    }
    await useOption(option, actor);
    return { closed: true, ok: true };
  } catch (err) {
    console.error("Tinhead's Combat Hud | resolve failed", err);
    ui.notifications.error(t("Notify.ResolveFailed"));
    return { closed: true, ok: false };
  }
}

/**
 * Serialize a HUD option for GM-side reconstruction.
 * @param {object} option
 * @param {Actor|null} actor
 */
export function serializeResolveOption(option, actor) {
  return {
    actorUuid: actor?.uuid ?? option.item?.actor?.uuid ?? null,
    itemUuid: option.item?.uuid ?? null,
    activityId: option.activity?.id ?? option.activity?._id ?? null,
    kind: option.kind ?? null,
    basicId: option.basicId ?? null,
    name: option.name ?? null,
    img: option.img ?? null,
    abilityId: option.abilityId ?? null,
    skillId: option.skillId ?? null,
    targetUuids: getSelectedTargetUuids(),
    requiresTarget: !!(option.requiresTarget
      ?? optionRequiresTarget(option.activity, option.item))
  };
}

/**
 * GM-side execution of a proxied resolve payload.
 * @param {object} payload
 * @param {{ actor?: Actor }} [ctx]
 */
export async function executeResolvePayload(payload, ctx = {}) {
  const actor = ctx.actor
    ?? (payload.actorUuid && typeof fromUuid === "function"
      ? await fromUuid(payload.actorUuid)
      : null);
  if (!actor) throw new Error(t("Notify.NoActor"));

  if (payload.kind === "ability-check" || payload.kind === "ability-save" || payload.kind === "skill-check" || payload.kind === "death-save") {
    await rollAbilityHudOption(actor, {
      kind: payload.kind,
      abilityId: payload.abilityId,
      skillId: payload.skillId
    });
    return { ok: true, closed: true };
  }

  const item = payload.itemUuid && typeof fromUuid === "function"
    ? await fromUuid(payload.itemUuid)
    : null;

  let activity = null;
  if (item && payload.activityId) {
    const activities = item.system?.activities;
    if (activities?.get) activity = activities.get(payload.activityId);
    else if (activities) {
      activity = Object.values(activities).find(a =>
        (a.id ?? a._id) === payload.activityId
      ) ?? null;
    }
  }

  const option = {
    kind: payload.kind,
    basicId: payload.basicId,
    name: payload.name,
    img: payload.img,
    item,
    activity,
    actor
  };

  await useOption(option);
  return { ok: true, closed: true };
}

/**
 * A weapon wedge or the Attack leaf under a special weapon.
 * @param {object} option
 * @returns {boolean}
 */
function isWeaponAttackOption(option) {
  return option?.kind === "weapon" || option?.kind === "weapon-attack";
}

/**
 * Live attack activity. The option may hold a stale copy without use()/rollAttack().
 * @param {object} option
 * @returns {object|null}
 */
function weaponAttackActivity(option) {
  const item = option?.item;
  const stored = option?.activity;
  const storedId = stored?.id ?? stored?._id ?? null;
  const collection = item?.system?.activities;
  const live = storedId && collection?.get?.(storedId);
  if (live && (live.type === "attack" || typeof live.rollAttack === "function")) return live;

  let entries = [];
  if (collection?.contents && Array.isArray(collection.contents)) entries = collection.contents;
  else if (typeof collection?.values === "function") entries = Array.from(collection.values());
  else if (collection && typeof collection[Symbol.iterator] === "function") entries = Array.from(collection);

  const found = entries.find(activity =>
    activity?.type === "attack" || typeof activity?.rollAttack === "function"
  );
  if (found) return found;
  if (stored && typeof stored.use === "function") return stored;
  return null;
}

function midiQolActive() {
  return !!game.modules?.get?.("midi-qol")?.active;
}

/**
 * Weapon attacks go through Midi-QOL when it is installed.
 * Otherwise dnd5e activity.use() runs the built-in attack.
 * @param {object} option
 */
async function useWeaponAttack(option) {
  const item = option.item ?? null;
  const activity = weaponAttackActivity(option);

  if (midiQolActive() && activity && typeof globalThis.MidiQOL?.completeActivityUse === "function") {
    const usage = {};
    const targetUuids = getSelectedTargetUuids();
    if (targetUuids.length) usage.midiOptions = { targetUuids };
    return globalThis.MidiQOL.completeActivityUse(
      activity,
      usage,
      { configure: true },
      { create: true }
    );
  }

  if (activity && typeof activity.use === "function") {
    return activity.use();
  }

  if (activity && typeof activity.rollAttack === "function") {
    return activity.rollAttack();
  }

  if (item && typeof item.use === "function") {
    return item.use();
  }

  if (item && typeof item.displayCard === "function") {
    return item.displayCard();
  }

  throw new Error("No usable activity or item.use() on option");
}

/**
 * Prefer activity.use(). Weapon attacks use Midi-QOL or dnd5e's attack.
 * Fall back to item.use(); then basic-action chat.
 * @param {object} option
 */
async function useOption(option, actor = null) {
  const { activity, item } = option;
  const resolvedActor = option.actor ?? item?.actor ?? actor ?? null;

  if (option.basicId === "dash") {
    await grantDashMovement(resolvedActor);
  }

  if (isWeaponAttackOption(option)) {
    return useWeaponAttack(option);
  }

  if (activity && typeof activity.use === "function") {
    return activity.use(
      { configure: true },
      { configure: true },
      { create: true }
    );
  }

  if (item && typeof item.use === "function") {
    return item.use({}, { configure: true }, { create: true });
  }

  if (option.kind === "basic") {
    return postBasicActionChat({
      ...option,
      actor: resolvedActor
    });
  }

  throw new Error("No usable activity or item.use() on option");
}

/**
 * Module-backed fallback when the actor has no matching Dash/Disengage/Dodge/Ready item.
 * @param {object} option
 */
async function postBasicActionChat(option) {
  const actor = option.actor
    ?? option.item?.actor
    ?? canvas?.tokens?.controlled?.[0]?.actor
    ?? game.user?.character
    ?? null;

  const name = option.name || "Action";
  const img = option.img || "icons/svg/mystery-man.svg";
  const speaker = ChatMessage.getSpeaker?.({ actor })
    ?? { alias: actor?.name || game.user?.name };

  const who = actor?.name || speaker.alias || "Character";
  const line = option.basicId === "ready-other"
    ? `<strong>${escapeHtml(who)}</strong> readies another action.`
    : option.basicId === "dash"
      ? `<strong>${escapeHtml(who)}</strong> takes the <em>${escapeHtml(name)}</em> action and gains extra movement equal to their speed until the end of this turn.`
      : `<strong>${escapeHtml(who)}</strong> takes the <em>${escapeHtml(name)}</em> action.`;
  const content = `
    <div class="dnd5e chat-card tinheads-combat-hud basic-action">
      <header class="card-header flexrow">
        <img src="${escapeAttr(img)}" alt="${escapeAttr(name)}" width="36" height="36" />
        <h3>${escapeHtml(name)}</h3>
      </header>
      <div class="card-content">
        <p>${line}</p>
      </div>
    </div>
  `;

  const ChatMsg = CONFIG.ChatMessage?.documentClass ?? ChatMessage;
  return ChatMsg.create({
    speaker,
    content,
    flavor: game.i18n?.localize?.("DND5E.Action") || "Action",
    flags: {
      "tinheads-combat-hud": {
        basicAction: option.basicId || true
      }
    }
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("'", "&#39;");
}
