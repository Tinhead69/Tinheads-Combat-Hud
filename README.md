# Tinhead's Combat Hud

Nested radial combat HUD for **Foundry VTT v13** and **dnd5e 3.0.0+**. Right-click a character token, open **Combat Hud**, and pick from a screen-centered radial. Wedges are color-coded and semi-transparent: Action copper, Bonus Action teal, Reaction steel, Checks slate.

Current module version: **0.1.28** (`module.json`).

## What it does

- Token HUD button labeled **Combat Hud**, plus Actor Directory and Combat Tracker context-menu entries
- Main radial: **Action**, **Checks**, **Bonus Action**, **Reaction**
- Center hub is **End Turn** (`Combat#nextTurn` for the GM or the current combatant's owner). **Esc** or a click outside closes the HUD
- Draggable HUD. Open nests stay on screen
- A nest with fewer than ten options uses a half circle. Ten or more use the full circle
- **socketlib** proxy for absent-player control: an observer can open the HUD, and a connected GM resolves the click
- Module wedge art for chrome. Weapons, spells, items, and features keep their sheet artwork

### Action

Hover **Action** for Dodge, Dash, Disengage, Help, Attack, Cast Spell, Ready, Other, Abilities, and Use Item.

- **Attack** lists equipped weapons and unarmed strike. A weapon with special activities opens **Use Ability**. Spent activities stay on that ring, greyed out, and do not click. A weapon click runs **Midi-QOL** when that module is active, and dnd5e's own attack otherwise.
- **Dash** adds extra movement equal to each speed the character already has, until the end of the current turn. Cunning Action Dash does the same.
- **Cast Spell** opens spell levels, then the spells prepared at that level.
- **Ready** can ready an attack, a spell, or another action.
- **Other** holds mundane and exploration actions from the sheet, including Shove, Grapple, Mount, Fall, Suffocation, Underwater, and Check Cover.
- **Abilities** holds class features whose activation cost is an action. Channel Divinity and Metamagic are one button each; the nest lists that feature's action options. Rest-only recovery stays off the ring.
- **Use Item** lists consumables you use as an action. With more than ten of them, potions share a **Potions** wedge and spell scrolls share a **Spell Scrolls** wedge.

### Bonus Action and Reaction

Each ring lists activities with that activation cost. Bonus Action always offers Cast Spell and Use Item. Reaction offers Attack of Opportunity, and Cast Spell when the character has reaction spells.

A rogue with Cunning Action gets Hide, Dash, and Disengage on the bonus ring. Hide makes a Stealth check.

### Checks

Hover **Checks** for **Saves**, **Skills**, and **Death Saves**.

- **Saves** lists the six saving throws.
- **Skills** lists every skill. A proficient skill has a silver outline. Expertise is filled gold.
- **Death Saves** rolls a death saving throw. The tooltip shows successes and failures out of 3.

## Requirements

| Piece | Version |
|---|---|
| Foundry VTT | **13** (verified against **13.351**) |
| Game system | **dnd5e** ≥ **3.0.0** |
| Module | **socketlib** (required) |

Activities (`activity.use()`) are used when the item has them (dnd5e 4.x and later). On 3.x items without activities, the module falls back to `Item#use()`.

A new `module.json` is read when the world is launched. Script and style changes apply on refresh (F5).

### Absent-player / proxy (socketlib)

| Role | Open HUD | Resolve / End Turn |
|---|---|---|
| GM | yes | **local** |
| OWNER | yes | **local** |
| OBSERVER (non-owner) | yes | **socketlib → GM** (`executeAsGM`); GM re-checks OBSERVER+ |
| Limited / none | no | no |

The GM client must be online for proxy requests. Owners never round-trip.

## Install

1. Copy this repository into your Foundry user data modules directory. The folder name must match the package id:

   ```text
   {User Data}/Data/modules/tinheads-combat-hud/
   ```

   Typical locations:

   - **Windows:** `%localappdata%\FoundryVTT\Data\modules\`
   - **macOS:** `~/Library/Application Support/FoundryVTT/Data/modules/`
   - **Linux:** `~/.local/share/FoundryVTT/Data/modules/`

2. Restart Foundry, or refresh the setup screen, so it rescans modules.
3. In the world, open **Game Settings → Manage Modules** and enable **Tinhead's Combat Hud**.
4. Confirm the world is using the **dnd5e** system.

### Dev symlink (optional)

```bash
ln -s /absolute/path/to/this/repo "${FOUNDRY_DATA}/Data/modules/tinheads-combat-hud"
```

## How to use

1. Select a token you own, or any token as GM.
2. **Right-click** the token to open the Token HUD.
3. Click the bullseye control, **Combat Hud**.
4. Hover a main wedge, then a nested wedge, then click the action you want.
5. Click the center hub to end the turn when it is that token's turn.
6. Click outside, or press **Esc**, to close without ending the turn.

Equip a weapon on the dnd5e inventory tab to put it on **Attack**. Unequipped weapons stay off the ring.

### Macro / API

```js
const token = canvas.tokens.controlled[0];
game.modules.get("tinheads-combat-hud").api.openForToken(token);
```

`openForActor` and `close` are on the same `api` object.

## UI preview

Foundry is not required to look at the radial. From the repo root:

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/preview/radial-preview.html`. The preview uses the demo actor and the same list builders. It does not roll dice.

## Project layout

```text
module.json
lang/en.json
styles/combat-hud.css
assets/icons/                 # chrome icons
assets/wedges/                # wedge fills
scripts/
  module.js                   # entry
  hooks/token-entry.mjs       # Token HUD and context menus
  data/                       # ring contents, rolls, and resolve
  ui/combat-hud.mjs           # radial HUD
  ui/radial-geometry.mjs      # wedge paths
preview/radial-preview.html
```
