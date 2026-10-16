/**
 * socketlib bridge for absentee / proxy resolve.
 *
 * Authorization:
 * - Request: OBSERVER+ (or GM) on the actor may open the HUD and request resolve.
 * - Execute: GM client via executeAsGM (Owners/GM who resolve locally skip the socket).
 * - Handler re-checks requester OBSERVER+ and never weakens Foundry perms on the GM.
 */

import { MODULE_ID, t } from "../data/actor-options.mjs";
import { shouldResolveLocally as shouldResolveLocallyPerm } from "../data/permissions.mjs";

/** @type {object|null} */
let socket = null;
let registered = false;

export const SOCKET_HANDLERS = Object.freeze({
  resolve: "tchResolve",
  endTurn: "tchEndTurn"
});

/**
 * Register with socketlib (Hooks.once("socketlib.ready")).
 */
export function registerSocket() {
  if (registered) return socket;
  const lib = globalThis.socketlib;
  if (!lib?.registerModule) {
    console.warn(`${MODULE_ID} | socketlib missing — proxy resolve disabled (Owner/GM local only).`);
    return null;
  }
  socket = lib.registerModule(MODULE_ID);
  socket.register(SOCKET_HANDLERS.resolve, onRemoteResolve);
  socket.register(SOCKET_HANDLERS.endTurn, onRemoteEndTurn);
  registered = true;
  console.log(`${MODULE_ID} | socketlib handlers registered`);
  return socket;
}

export function getSocket() {
  return socket;
}

export function isSocketReady() {
  return !!(socket && registered);
}

export function shouldResolveLocally(actor) {
  return shouldResolveLocallyPerm(actor);
}

/**
 * @param {object} payload serialized resolve request
 * @returns {Promise<{ ok: boolean, closed?: boolean, error?: string }>}
 */
export async function requestRemoteResolve(payload) {
  ensureSocketOrThrow();
  return socket.executeAsGM(SOCKET_HANDLERS.resolve, {
    ...payload,
    requesterId: game.user.id
  });
}

/**
 * @param {object} [payload]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function requestRemoteEndTurn(payload = {}) {
  ensureSocketOrThrow();
  return socket.executeAsGM(SOCKET_HANDLERS.endTurn, {
    ...payload,
    requesterId: game.user.id,
    combatUuid: game.combat?.uuid ?? null
  });
}

function ensureSocketOrThrow() {
  if (isSocketReady()) return;
  const err = new Error(t("Proxy.SocketlibMissing"));
  err.tchProxy = true;
  throw err;
}

/**
 * GM-side handler.
 * @param {object} payload
 */
async function onRemoteResolve(payload) {
  const requester = game.users.get(payload?.requesterId);
  const actor = await resolveActorUuid(payload?.actorUuid);
  assertRequesterMayProxy(requester, actor);

  try {
    const { executeResolvePayload } = await import("../data/resolve.mjs");
    const result = await executeResolvePayload(payload, { actor, requester });
    return { ok: !!result?.ok, closed: result?.closed !== false };
  } catch (err) {
    console.error(`${MODULE_ID} | remote resolve failed`, err);
    return { ok: false, closed: true, error: err?.message || t("Notify.ResolveFailed") };
  }
}

/**
 * GM-side End Turn handler.
 * @param {object} payload
 */
async function onRemoteEndTurn(payload) {
  const requester = game.users.get(payload?.requesterId);
  const combat = game.combat;
  if (!combat) {
    return { ok: false, error: t("EndTurn.NoCombat") };
  }
  const combatant = combat.combatant;
  const actor = combatant?.actor ?? null;
  // End Turn proxy: requester must be OBSERVER+ on the current combatant actor (or GM).
  assertRequesterMayProxy(requester, actor);

  try {
    const { executeEndTurnPayload } = await import("../data/combat-turn.mjs");
    await executeEndTurnPayload({ combat, requester });
    return { ok: true };
  } catch (err) {
    console.error(`${MODULE_ID} | remote end turn failed`, err);
    return { ok: false, error: err?.message || t("EndTurn.Unavailable") };
  }
}

/**
 * @param {User|null} requester
 * @param {Actor|null} actor
 */
export function assertRequesterMayProxy(requester, actor) {
  if (!requester) {
    throw new Error(t("Proxy.Unauthorized"));
  }
  if (requester.isGM) return true;
  if (!actor) {
    throw new Error(t("Proxy.Unauthorized"));
  }
  if (!userHasObserver(actor, requester)) {
    throw new Error(t("Proxy.Unauthorized"));
  }
  return true;
}

export function userHasObserver(actor, user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;
  if (actor.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return true;
  // String level fallback for older wrappers
  if (actor.testUserPermission?.(user, "OBSERVER")) return true;
  if (actor.isOwner && user.id === game.user?.id) return true;
  return false;
}

async function resolveActorUuid(uuid) {
  if (!uuid) return null;
  if (typeof fromUuid === "function") {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Actor" ? doc : doc?.actor ?? null;
  }
  return null;
}
