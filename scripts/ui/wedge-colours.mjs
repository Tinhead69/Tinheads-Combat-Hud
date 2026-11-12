import { MODULE_ID, t } from "../data/actor-options.mjs";

const MAIN_WEDGE_COLOURS = {
  action: { key: "actionColour", section: "Sections.Action", default: "#a85c28" },
  bonus: { key: "bonusActionColour", section: "Sections.BonusAction", default: "#24766c" },
  reaction: { key: "reactionColour", section: "Sections.Reaction", default: "#38609e" },
  checks: { key: "checksColour", section: "Sections.Checks", default: "#56687c" }
};

export function registerMainWedgeColours(onChange) {
  for (const setting of Object.values(MAIN_WEDGE_COLOURS)) {
    game.settings.register(MODULE_ID, setting.key, {
      name: t("Settings.WedgeColour", { section: t(setting.section) }),
      hint: t("Settings.WedgeColourHint"),
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
