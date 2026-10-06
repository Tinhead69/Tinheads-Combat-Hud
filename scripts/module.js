/**
 * Tinhead's Combat Hud — Foundry VTT module entry.
 */

import { registerTokenEntry } from "./hooks/token-entry.mjs";
import { registerSocket } from "./net/socket.mjs";
import { CombatHud } from "./ui/combat-hud.mjs";
import { MODULE_ID } from "./data/actor-options.mjs";
import { socketlibModuleActive } from "./data/permissions.mjs";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Tinhead's Combat Hud`);
});

Hooks.once("socketlib.ready", () => {
  registerSocket();
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") {
    console.warn(`${MODULE_ID} | dnd5e system not active; Combat Hud will not register.`);
    return;
  }

  // socketlib.ready may have already fired before this module's hook bound.
  if (socketlibModuleActive() && globalThis.socketlib) {
    registerSocket();
  } else if (!socketlibModuleActive()) {
    ui.notifications?.warn?.(
      game.i18n?.localize?.("TINHEADS_COMBAT_HUD.Proxy.SocketlibMissing")
      || "Tinhead's Combat Hud: enable socketlib for proxy/absent-player resolve."
    );
  }

  registerTokenEntry();

  game.modules.get(MODULE_ID).api = {
    openForToken: (token) => CombatHud.openForToken(token),
    openForActor: (actor) => CombatHud.openForActor(actor),
    close: () => CombatHud.closeActive()
  };

  console.log(`${MODULE_ID} | Ready`);
});
