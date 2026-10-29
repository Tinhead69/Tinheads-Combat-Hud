/**
 * Dash grants extra movement equal to each speed the actor already has.
 * A turn-long active effect doubles walk, and fly/swim/climb/burrow when those are above 0.
 * The base speeds on the sheet are left alone.
 */

import { t } from "./actor-options.mjs";
import { moduleIcon } from "./module-icons.mjs";

const MOVEMENT_TYPES = Object.freeze(["walk", "fly", "swim", "climb", "burrow"]);

/**
 * ADD changes that double every movement type the actor can already use.
 * @param {object|null|undefined} movement actor.system.attributes.movement
 * @returns {Array<{ key: string, mode: number, value: string }>}
 */
export function dashMovementChanges(movement) {
  const mode = globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
  const changes = [];
  for (const type of MOVEMENT_TYPES) {
    const speed = Number(movement?.[type]);
    if (!Number.isFinite(speed) || speed <= 0) continue;
    changes.push({
      key: `system.attributes.movement.${type}`,
      mode,
      value: String(speed)
    });
  }
  return changes;
}

/**
 * @param {Actor|null|undefined} actor
 * @returns {Promise<Array<{ key: string, mode: number, value: string }>>}
 */
export async function grantDashMovement(actor) {
  const changes = dashMovementChanges(actor?.system?.attributes?.movement);
  if (!changes.length || typeof actor?.createEmbeddedDocuments !== "function") return changes;

  const modern = Number(globalThis.game?.release?.generation
    ?? parseInt(globalThis.game?.version ?? "0", 10)) >= 14;
  const effect = {
    name: t("BasicActions.Dash"),
    img: moduleIcon("dash"),
    transfer: false,
    flags: { "tinheads-combat-hud": { dash: true } }
  };
  if (modern) {
    const combat = globalThis.game?.combat?.started ? game.combat : null;
    const documentClass = globalThis.CONFIG?.ActiveEffect?.documentClass
      ?? globalThis.ActiveEffect?.implementation ?? globalThis.ActiveEffect;
    Object.assign(effect, {
      type: "base",
      system: { changes, origin: { actor: actor.uuid ?? null } },
      start: typeof documentClass?.getEffectStart === "function"
        ? documentClass.getEffectStart(combat)
        : {
          time: globalThis.game?.time?.worldTime ?? 0,
          combat: combat?.id ?? null,
          combatant: combat?.combatant?.id ?? null,
          initiative: combat?.combatant?.initiative ?? null,
          round: combat?.round ?? null,
          turn: combat?.turn ?? null
        },
      // Eligible immediately, but expires only at the end-of-turn event.
      duration: combat ? { value: 0, units: "turns", expiry: "turnEnd" }
        : { value: 6, units: "seconds", expiry: null }
    });
  } else {
    Object.assign(effect, { origin: actor.uuid ?? null, changes, duration: dashDuration() });
  }
  try {
    await actor.createEmbeddedDocuments("ActiveEffect", [effect]);
  } catch (err) {
    console.error("Tinhead's Combat Hud | dash movement failed", err);
  }
  return changes;
}

function dashDuration() {
  const combat = globalThis.game?.combat;
  if (combat?.started && combat.round != null) {
    return {
      combat: combat.id,
      rounds: 0,
      turns: 1,
      startRound: combat.round,
      startTurn: combat.turn ?? 0
    };
  }
  return { seconds: 6 };
}
