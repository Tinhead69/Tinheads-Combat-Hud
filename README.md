# Tinhead's Combat Hud

This is a nested radial Combat HUD for **Foundry VTT v14** and **dnd5e 6.0.0+**. dnd5e 6.0.0 and requires Foundry 14.367 or later. It allows players or the DM to see all the actor or NPC actions, reactions, bonus actions and skill checks in an easy to view manner and without having to open the character sheet everytime.  Clicking of a function on the radial hud, hands off any rolls to either midi-qol or the inbuilt functions of foundry.

It is not accessible when the game is paused.

When installed, it places a target icon on the bottom left when you right click the targeting icon to the lower right of the character icon

![Icon_location](Screenshots/Hud-start-icon.png)

Clicking the icon opens the basic combat hud up on the screen which can be dragged around to a more appropriate space on your screen; it will remember this location the netx time it is opened.  There is also a small window that starts in the top right of the screen which allows you to toggle whether the hud stays open all the time or closes after any function has been activated.  This can also be dragged to a more appropriate position..

![Hud_Open](Screenshots/Hud-open.png)


## Using the Hud 

Once the hud is open and on the screen, moving over any of the wedges will show different functions that can be carried out as either an **Action**, **Bonus Action**, **Reaction** or **Checks**.  These are reliant on the relevant functions being set up correctly on the character sheet as it filters them by their action types.

### Actions 

![Hud_Action](Screenshots/Hud-action.png)

Under the Action wedge you will find all things that can be carried out as an action.  

These include **Attack**, **Cast Spell, **Use items**, **Dodge**, **Disengage** etc.  Moving over the relevant wedge may open up a further radial depending on whether there are a choice of options available within that action.  For example, **Attack** should show any equipped weapons, allowing you to attack with them; **Cast Spells** will show the spell levels and number of spell slots (if any available to you), moving onto a spell level opens up available spells in that level.  Hovering over the spell will provide a tool tip for that spell.

Weapons that are not equipped do not show on the Hud.

![Cast_Spell_Action](Screenshots/cast-spell-radial-info.png)

Clicking the action will offload it to Foundry or Midi-Qol to complete the task and generate any rolls.

**Abilities** shows items that you may be able to do as part of your class, such as channel divinity, Lay on Hands or Recover Sorcery Points.  Again these rely on them being set up correctly on the character sheet.

If you have no abilities under this tab, a message pops up saying 'No Feature Options".

**Ready** allows you to prepare an action for use later in the turn.  Selecting the action you wish to take will generate a chat card to notify all what your action is.  A window will then pop up for the player who can complete the action when the trigger for their action occurs.  Should the combat tracker move to a new round then the ready action will expire and any resources will be consumed.
-------------TBC----------------

## Bonus Action lists those abilities that can be carried out as a bonus action and can include **Use Item** such as taking a potion during combat (if allowed) or *Cast Spell** such as **Misty Step**

## Checks

Under the skills wedge you will find the characters **skills**, **saving throws** and **Death Saves**.  All use the characters ability modifiers from their character sheet and clicking the wedge triggers the appropriate roll mechanism, depending on which you are using. 

**Skills** are colour coded based on their base attribute and those with a silver border indicate skills that have proficiency; those with a gold border have expertise applied to them.  Tool tips show the applied base attribute and their modifier and whether they have proficiency or expertise

![Skills_Wedge](Screenshots/skills.png)

**Death Saves** checks to ensure a character has 0 hp and throws up a message if that's not the case.  Clicking the wedge rolls a D20 marking a success or failure on the character sheet.  The tool tip for this shows the current state of any successes or failures.

![Death_Saves](Screenshots/death-saves.png)

## Reaction

Under this wedge are any abilities that are allowed as a reaction, whether they are spells, attacks of opportunity or other.  

**Attack of Opportunity** mirrors your equipped weapons and if you have the **War Caster* feat, your spells are also listed under here.
**Uncanny Dodge is listed under here for rogues.

![Reactions](Screenshots/reactions.png)

## End Turn

In the centre of the Hud is the End Turn button.  This will only work if you are the active character in the combat tracker.

## Supported version

This project supports **Foundry VTT v14 only**, with a minimum version of **14.367** and **dnd5e 6.0.0**.


