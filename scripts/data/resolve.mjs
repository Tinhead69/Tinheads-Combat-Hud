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

  const requiresTarget = option.kind === "ability-check" || option.kind === "ability-save"
    ? false
    : (option.requiresTarget ?? optionRequiresTarget(option.activity, option.item));

  if (requiresTarget && !hasActiveTargets()) {
    ui.notifications.warn(t("Notify.SelectTarget"));
    return { closed: true, ok: false };
  }

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
    if (option.kind === "ability-check" || option.kind === "ability-save") {
      await rollAbilityHudOption(actor, option);
      return { closed: true, ok: true };
    }
    await useOption(option);
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

  if (payload.kind === "ability-check" || payload.kind === "ability-save") {
    await rollAbilityHudOption(actor, {
      kind: payload.kind,
      abilityId: payload.abilityId
    });
    return { ok: true, closed: true };
  }

  if (payload.requiresTarget && !(payload.targetUuids?.length)) {
    // Requester said they had targets; if list empty, refuse.
    throw new Error(t("Notify.SelectTarget"));
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

function hasActiveTargets() {
  return (game.user?.targets?.size ?? 0) > 0;
}

/**
 * Weapon attacks post the item chat card only.
 * activity.use({ configure: true }) also opens the Attack Roll dialog.
 * @param {object} option
 * @returns {boolean}
 */
function isWeaponAttackOption(option) {
  return option?.kind === "weapon" || option?.kind === "weapon-attack";
}

/**
 * Prefer activity.use(); weapon attacks post a chat card instead of the roll dialog.
 * Fall back to item.use(); then basic-action chat.
 * @param {object} option
 */
async function useOption(option) {
  const { activity, item } = option;

  if (isWeaponAttackOption(option) && item && typeof item.displayCard === "function") {
    return item.displayCard();
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
    return postBasicActionChat(option);
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
  const content = `
    <div class="dnd5e chat-card tinheads-combat-hud basic-action">
      <header class="card-header flexrow">
        <img src="${escapeAttr(img)}" alt="${escapeAttr(name)}" width="36" height="36" />
        <h3>${escapeHtml(name)}</h3>
      </header>
      <div class="card-content">
        <p><strong>${escapeHtml(who)}</strong> takes the <em>${escapeHtml(name)}</em> action.</p>
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
