/**
 * Token entry points for opening the Combat Hud.
 * Foundry right-click on a canvas token opens the Token HUD — that is the
 * practical "token context menu" surface. We also register Actor sidebar
 * context options as a secondary discoverable entry.
 */

import { CombatHud } from "../ui/combat-hud.mjs";
import { actorFromToken, canUseActor, t } from "../data/actor-options.mjs";

/**
 * Register hooks that open the HUD from a token / actor.
 */
export function registerTokenEntry() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);

  // v13 document context menus (Actor directory / applications that expose them)
  Hooks.on("getActorContextOptions", onGetActorContextOptions);

  // Combat tracker combatant context (token-linked)
  Hooks.on("getCombatantContextOptions", onGetCombatantContextOptions);
}

/**
 * @param {TokenHUD} hud
 * @param {HTMLElement|JQuery} html
 */
function onRenderTokenHUD(hud, html) {
  const token = hud.object ?? hud.actor?.token ?? null;
  const actor = token?.actor ?? hud.actor ?? null;
  if (!actor || !canUseActor(actor)) return;

  const root = html?.jquery ? html[0] : html;
  if (!root?.querySelector) return;

  // Avoid duplicates on re-render
  if (root.querySelector(".tch-token-hud-btn")) return;

  const button = document.createElement("div");
  button.classList.add("control-icon", "tch-token-hud-btn");
  button.dataset.tchAction = "open-combat-hud";
  button.title = t("TokenHUD.Hint");
  button.setAttribute("aria-label", t("TokenHUD.Open"));
  button.innerHTML = `<i class="fa-solid fa-bullseye"></i>`;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    // Close Token HUD chrome so the radial owns the overlay
    hud.close?.();
    CombatHud.openForToken(token ?? actor);
  });

  const left = root.querySelector(".col.left");
  const right = root.querySelector(".col.right");
  (left ?? right ?? root).appendChild(button);
}

/**
 * @param {Application} _app
 * @param {object[]} menuItems
 */
function onGetActorContextOptions(_app, menuItems) {
  menuItems.push({
    name: t("TokenHUD.Open"),
    icon: '<i class="fa-solid fa-bullseye"></i>',
    condition: (li) => {
      const actor = resolveActorFromContext(li, _app);
      return !!actor && canUseActor(actor);
    },
    callback: (li) => {
      const actor = resolveActorFromContext(li, _app);
      if (actor) CombatHud.openForActor(actor);
    }
  });
}

/**
 * @param {Application} _app
 * @param {object[]} menuItems
 */
function onGetCombatantContextOptions(_app, menuItems) {
  menuItems.push({
    name: t("TokenHUD.Open"),
    icon: '<i class="fa-solid fa-bullseye"></i>',
    condition: (li) => {
      const combatant = resolveCombatantFromContext(li, _app);
      const actor = combatant?.actor;
      return !!actor && canUseActor(actor);
    },
    callback: (li) => {
      const combatant = resolveCombatantFromContext(li, _app);
      const token = combatant?.token;
      if (token) CombatHud.openForToken(token);
      else if (combatant?.actor) CombatHud.openForActor(combatant.actor);
    }
  });
}

function resolveActorFromContext(li, app) {
  // ApplicationV2 entry / directory row
  const el = li?.jquery ? li[0] : li;
  const entryId = el?.dataset?.documentId
    || el?.dataset?.entryId
    || el?.closest?.("[data-document-id]")?.dataset?.documentId
    || el?.closest?.("[data-entry-id]")?.dataset?.entryId;

  if (entryId) {
    const actor = game.actors.get(entryId);
    if (actor) return actor;
  }

  if (app?.document?.documentName === "Actor") return app.document;
  if (li?.document?.documentName === "Actor") return li.document;

  // Controlled token fallback
  const controlled = canvas?.tokens?.controlled?.[0];
  return actorFromToken(controlled);
}

function resolveCombatantFromContext(li, app) {
  const el = li?.jquery ? li[0] : li;
  const id = el?.dataset?.combatantId
    || el?.closest?.("[data-combatant-id]")?.dataset?.combatantId;
  if (id) return game.combat?.combatants?.get(id) ?? null;
  if (li?.document?.documentName === "Combatant") return li.document;
  if (app?.document?.documentName === "Combatant") return app.document;
  return null;
}
