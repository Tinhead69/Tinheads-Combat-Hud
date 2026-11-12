import { MODULE_ID } from "../data/actor-options.mjs";

const MAIN_WEDGE_COLOURS = {
  action: { key: "actionColour", default: "#a85c28" },
  bonus: { key: "bonusActionColour", default: "#24766c" },
  reaction: { key: "reactionColour", default: "#38609e" },
  checks: { key: "checksColour", default: "#56687c" }
};

export function registerMainWedgeColours(onChange) {
  for (const setting of Object.values(MAIN_WEDGE_COLOURS)) {
    game.settings.register(MODULE_ID, setting.key, {
      name: `TINHEADS_COMBAT_HUD.Settings.${setting.key}`,
      hint: "TINHEADS_COMBAT_HUD.Settings.WedgeColourHint",
      scope: "user",
      config: true,
      type: new foundry.data.fields.ColorField({ nullable: false, blank: false }),
      default: setting.default,
      onChange
    });
  }
}

export function applyMainWedgeColour(wedge) {
  const setting = MAIN_WEDGE_COLOURS[wedge.dataset.section];
  const value = game.settings?.get(MODULE_ID, setting.key);
  const colour = String(value?.css ?? value ?? "").trim().toLowerCase();
  const custom = /^#[0-9a-f]{6}$/.test(colour) && colour !== setting.default;
  wedge.toggleAttribute("data-custom-colour", custom);
  if (custom) wedge.style.setProperty("--tch-main-wedge-colour", colour);
  else wedge.style.removeProperty("--tch-main-wedge-colour");
}
