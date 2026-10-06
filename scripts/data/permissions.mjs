/**
 * Permission helpers for HUD open vs local resolve vs proxy request.
 */

/**
 * May open the Combat Hud UI for this actor.
 * GM, OWNER, or OBSERVER (absentee/proxy viewers).
 * @param {Actor} actor
 */
export function canOpenHud(actor) {
  if (!actor || !game.user) return false;
  if (game.user.isGM) return true;
  if (actor.isOwner) return true;
  try {
    if (actor.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return true;
    if (actor.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return true;
    if (actor.testUserPermission?.(game.user, "OWNER")) return true;
    if (actor.testUserPermission?.(game.user, "OBSERVER")) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
}

/**
 * Legacy alias used by entry hooks — same as {@link canOpenHud}.
 * @param {Actor} actor
 */
export function canUseActor(actor) {
  return canOpenHud(actor);
}

/**
 * This client may execute use()/rolls/nextTurn locally (no socketlib).
 * @param {Actor} actor
 */
export function canResolveLocally(actor) {
  if (!actor || !game.user) return false;
  if (game.user.isGM) return true;
  if (actor.isOwner) return true;
  try {
    return !!actor.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
  } catch (_) {
    return false;
  }
}

/**
 * Collect selected target document UUIDs for proxy payloads.
 * @returns {string[]}
 */
export function getSelectedTargetUuids() {
  const targets = game.user?.targets;
  if (!targets?.size) return [];
  const uuids = [];
  for (const token of targets) {
    const uuid = token.document?.uuid ?? token.uuid;
    if (uuid) uuids.push(uuid);
  }
  return uuids;
}

export function socketlibModuleActive() {
  return !!game.modules.get("socketlib")?.active;
}

/**
 * True when this client should execute locally (no socket round-trip).
 * @param {Actor} actor
 */
export function shouldResolveLocally(actor) {
  return canResolveLocally(actor);
}
