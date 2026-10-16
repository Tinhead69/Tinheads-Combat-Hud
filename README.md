# Tinhead's Combat Hud

Nested radial combat HUD for **Foundry VTT v13** + **dnd5e 3.0.0+** (**v0.2.1**). Right-click a token, open **Combat Hud**, then pick from a screen-centered radial with color-coded, semi-transparent wedges (Action copper · Bonus viridian · Reaction steel · Checks slate). Tinhead’s own look — not an Argon-style docked bar.

## Features

- Token HUD button (**Combat Hud**), plus actor directory and combatant context-menu entries
- Viewport-centered, **draggable** radial; nested rings are **partial arcs** sized from title length (short leaves stay compact; crowded nests use more of the circle); open nests stay clamped on-screen
- **Character HUD** (no CR): **Action | Checks | Bonus Action | Reaction**
  - Favorited weapons (PCs) · Dash/Disengage/Dodge/Ready · class features by activation · **Use Item** · **Cast Spell**
  - Non-CR NPCs keep Character chrome and also get sheet attacks/features by activation
  - Special weapons → **Attack** / **Use Ability**; **Checks** → STR…CHA → Check | Save
- **Monster HUD** (has Challenge Rating, including **0**): **Action | Bonus | Reaction** only
  - Sheet attacks + combat features by dnd5e activation (Multiattack, breath, legendary/lair, Nimble Escape, Parry, …)
  - No Checks, Cast Spell / Use Item hubs, favorites cue, or module Dash chrome
- Center hub = **End Turn**; **Esc** / backdrop dismiss
- **socketlib** proxy for absent-player control (OBSERVER opens HUD; GM executes `use()` / rolls / End Turn)
- Sheet `item.img` on document leaves; clipped wedge fills under translucent economy tints for chrome

## Requirements

| Piece | Version |
|---|---|
| Foundry VTT | **13** (verified against **13.351**) |
| Game system | **dnd5e** ≥ **3.0.0** |
| Module | **socketlib** (required relationship) |

Activities (`activity.use()`) are preferred when present (dnd5e 4.x+). On 3.x builds without activities, the module falls back to `Item#use()`.

### Permissions / proxy (socketlib)

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
3. Open your **World** → **Game Settings** → **Manage Modules** → enable **Tinhead's Combat Hud** and **socketlib**.
4. Confirm the world is using the **dnd5e** system.

### Dev symlink (optional)

From this repo:

```bash
ln -s /absolute/path/to/this/repo "${FOUNDRY_DATA}/Data/modules/tinheads-combat-hud"
```

## How to use

1. Place / select a token you own (or GM any token).
2. **Right-click** the token to open the Token HUD.
3. Click the **bullseye** control (**Combat Hud**).
4. HUD opens centered on the screen:
   - **Characters (no CR):** hover Action / Checks / Bonus / Reaction; click a leaf to resolve through dnd5e
   - **Monsters (has CR):** hover Action / Bonus / Reaction for sheet attacks and features
   - Center hub **End Turn** advances combat when allowed
   - Click outside or press **Esc** to close without ending the turn

### Favorites (Character HUD / PCs)

Weapons on the Action ring come from the character sheet **Favorites** (`actor.system.favorites`), filtered to **weapons only**. Favorite a weapon on the dnd5e sheet first. Monster HUD ignores favorites and uses sheet Actions instead.

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
  data/actor-options.mjs    # profiles, favorites, spells, NPC routing
  data/resolve.mjs          # use() / targeting feedback
  net/socket.mjs            # socketlib proxy
  ui/combat-hud.mjs         # radial HUD controller
  ui/radial-geometry.mjs    # wedge path math
preview/
  radial-preview.html       # static visual mock
```

## Deferred

Still later: Skills under Checks, rich unavailable styling, slot badges, backdrop blur, opacity settings, keybind entry, multi-target UX.
