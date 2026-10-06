# Tinhead's Combat Hud

Nested radial combat HUD for **Foundry VTT v13** + **dnd5e 3.0.0+**. Right-click a character token, open **Combat Hud**, then pick from a screen-centered radial with color-coded, semi-transparent wedges (Action copper · Bonus teal · Reaction steel · Checks slate — Tinhead’s own look, not Argon).

## What this first slice includes

- Module scaffold (`module.json`, styles, i18n, ES modules)
- Token HUD button (Foundry’s right-click token surface) labeled **Combat Hud**
- Actor directory + combatant context-menu entries
- Compact viewport-centered main radial: **Action | Checks | Bonus Action | Reaction**
- Hover **Action** → equipped weapons + Dash/Disengage/Dodge/Ready + class features (e.g. Lay on Hands / Channel Divinity) + **Use Item** + **Cast Spell**
- Special weapons → **Attack** / **Use Ability** → ability modes; plain weapons stay direct attack leaves
- Hover **Checks** → STR…CHA → **Check** | **Save** via dnd5e `rollAbilityCheck` / `rollSavingThrow`
- Hover **Cast Spell** → **available** spell levels only → spells (`item.img` + tooltips)
- Hover **Use Item** → consumables only → click `use()` → close HUD
- Center hub = **End Turn** (`Combat#nextTurn` when GM or current combatant owner); **Esc** / backdrop dismiss
- **Draggable** HUD (grab ring + hub drag-threshold); position clamped so open nests stay on-screen
- Nested rings are **partial arcs** (not full 360°)
- Class features route to Action / Bonus / Reaction by dnd5e activation (rest-only recovery excluded)
- **socketlib** proxy for absent-player control (OBSERVER opens HUD; GM executes `use()` / rolls / End Turn)
- **Module SVG chrome icons** in `assets/icons/` for non-document wedges; weapons/spells/items/features keep sheet `item.img` when present
- **Clipped wedge image fills** (`assets/wedges/*.webp`) under translucent economy color tints — art enhances wedges without replacing copper/viridian/steel/slate identity

## Requirements

| Piece | Version |
|---|---|
| Foundry VTT | **13** (verified against **13.351**) |
| Game system | **dnd5e** ≥ **3.0.0** |
| Module | **socketlib** (required relationship) |

Activities (`activity.use()`) are preferred when present (dnd5e 4.x+). On 3.x builds without activities, the module falls back to `Item#use()`.

### Absent-player / proxy (socketlib)

| Role | Open HUD | Resolve / End Turn |
|---|---|---|
| GM | yes | **local** |
| OWNER | yes | **local** |
| OBSERVER (non-owner) | yes | **socketlib → GM** (`executeAsGM`); GM re-checks OBSERVER+ |
| Limited / none | no | no |

The GM client must be online for proxy requests. Owners never round-trip.

## Install (local / Data folder)

1. Copy this repository folder into your Foundry user data modules directory so the folder name matches the package id:

   ```text
   {User Data}/Data/modules/tinheads-combat-hud/
   ```

   The folder **must** be named `tinheads-combat-hud` (same as `"id"` in `module.json`).

   Typical user-data locations:

   - **Windows:** `%localappdata%\FoundryVTT\Data\modules\`
   - **macOS:** `~/Library/Application Support/FoundryVTT/Data/modules/`
   - **Linux:** `~/.local/share/FoundryVTT/Data/modules/`

2. Restart Foundry (or refresh the setup screen) so it rescans modules.
3. Open your **World** → **Game Settings** → **Manage Modules** → enable **Tinhead's Combat Hud**.
4. Confirm the world is using the **dnd5e** system.

### Dev symlink (optional)

From this repo:

```bash
ln -s /absolute/path/to/this/repo "${FOUNDRY_DATA}/Data/modules/tinheads-combat-hud"
```

## How to use

1. Place / select a character token you own (or GM any token).
2. **Right-click** the token to open the Token HUD.
3. Click the **bullseye** control (**Combat Hud**).
4. HUD opens centered on the screen:
   - Hover **Action** → weapons, basics, features, Use Item, Cast Spell
   - Hover **Checks** → abilities → Check or Save
   - Hover **Bonus Action** / **Reaction** → matching activities
   - Click a leaf to resolve through dnd5e and close the HUD
   - Center hub **End Turn** advances combat when allowed
   - Click outside or press **Esc** to close without ending the turn

### Favorites

Weapons on the Action ring are the actor's **equipped** weapons (`item.system.equipped`). Equip a weapon on the dnd5e inventory tab; unequipped weapons stay off the ring.

### Macro / API (debug)

With the module enabled:

```js
const token = canvas.tokens.controlled[0];
game.modules.get("tinheads-combat-hud").api.openForToken(token);
```

## UI preview (no Foundry)

This environment cannot run the Foundry client. For a static look at the radial geometry, open:

```bash
# from repo root
python3 -m http.server 8765
# then visit http://127.0.0.1:8765/preview/radial-preview.html
```

The preview uses mock data only; it does not call dnd5e.

## Project layout

```text
module.json
README.md
lang/en.json
styles/combat-hud.css
scripts/
  module.js                 # entry
  hooks/token-entry.mjs     # Token HUD + context menus
  data/actor-options.mjs    # equipped weapons, spells, BA/R helpers
  data/resolve.mjs          # use() / targeting feedback
  ui/combat-hud.mjs         # radial HUD controller
  ui/radial-geometry.mjs    # wedge path math
preview/
  radial-preview.html       # static visual mock
```

## Deferred (not in this slice)

Consumables live under Action → Use Item. Still deferred: rich unavailable styling, slot badges, backdrop blur, opacity settings, level-segment tooltips, caption-vs-tooltip polish, keybind entry, multi-target UX.
