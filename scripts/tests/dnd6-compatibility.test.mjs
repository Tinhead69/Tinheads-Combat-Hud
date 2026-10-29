/** Source-derived contracts from dnd5e release-6.0.0; also covers legacy compatibility. */
import assert from 'node:assert/strict';
const warnings = [];
globalThis.game = {
  system: { id: 'dnd5e', version: '6.0.0' }, release: { generation: 14 }, time: { worldTime: 100 },
  user: { isGM: true, targets: new Set() },
  i18n: { format: key => key }, modules: new Map(), messages: { contents: [] }, combat: null
};
globalThis.ui = { notifications: { warn: text => warnings.push(text), error: text => warnings.push(text) } };
globalThis.foundry = { utils: { isNewerVersion: () => true, duplicate: value => structuredClone(value) } };
globalThis.CONFIG = { DND5E: { abilities: {}, defaultArtwork: { Item: {} }, spellcasting: { spell: { prepares: true, slots: true } } } };
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2 }, DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
const base = '../';
const { rollAbilityHudOption } = await import(base + 'data/ability-checks.mjs');
const { resolveHudOption, executeResolvePayload } = await import(base + 'data/resolve.mjs');
const { getSpellLevels, buildSpellTooltipData } = await import(base + 'data/actor-options.mjs');
const { grantDashMovement } = await import(base + 'data/dash-movement.mjs');
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.log('FAIL ' + name + ': ' + error.message); }
}
await check('ability checks, saves, skills and death saves use the 6.0 argument shapes', async () => {
  const calls = [];
  const actor = Object.fromEntries(['rollAbilityCheck','rollSavingThrow','rollSkill','rollDeathSave'].map(name => [name, config => calls.push([name, config])]));
  await rollAbilityHudOption(actor, { kind: 'ability-check', abilityId: 'str' });
  await rollAbilityHudOption(actor, { kind: 'ability-save', abilityId: 'dex' });
  await rollAbilityHudOption(actor, { kind: 'skill-check', skillId: 'ste' });
  await rollAbilityHudOption(actor, { kind: 'death-save' });
  assert.deepEqual(calls, [['rollAbilityCheck',{ability:'str'}],['rollSavingThrow',{ability:'dex'}],['rollSkill',{skill:'ste'}],['rollDeathSave',{}]]);
});
await check('activity use retains its three configuration arguments', async () => {
  let configs;
  const actor = { isOwner: true };
  await resolveHudOption({ actor, activity: { use: async (...args) => { configs = args; } } });
  assert.equal(configs.length, 3);
  assert.equal(configs[1].configure, true);
  assert.equal(configs[2].create, true);
});
await check('6.0 method/prepared spell data and item-granted copies populate the HUD', () => {
  const spell = { id:'normal', name:'Prepared Spell', type:'spell', isOwner:true, system:{level:1,method:'spell',prepared:1} };
  const cast = { id:'cast', displayInSpellbook:true, canUse:true, activation:{type:'action'} };
  const extra = { id:'extra', name:'Granted Spell', type:'spell', isOwner:true, flags:{dnd5e:{cachedFor:'.Item.feature.Activity.cast'}}, system:{level:1,method:'spell',prepared:0,linkedActivity:cast} };
  const actor = { items:[spell,extra], system:{spells:{spell1:{value:1,max:2}}} };
  const { levels }=getSpellLevels(actor);
  assert.equal(levels.find(x=>x.id==='atwill').spells[0].activity,cast);
  assert.equal(levels.find(x=>x.level===1).spells[0].name,'Prepared Spell');
});
await check('Legendary Resistance finds a 6.0 typed saving-throw message without legacy flags', async () => {
  let resisted = false;
  const actor = { id:'dragon', isOwner:true, system:{resistSave:async () => {resisted = true;}} };
  game.messages.contents = [{ id:'save', type:'save', speaker:{actor:'dragon'}, system:{type:'ability',resisted:false}, rolls:[{isSuccess:false}] }];
  await resolveHudOption({kind:'legendary-resistance',actor,available:true});
  assert.equal(resisted,true, 'typed save was not found; warning: '+warnings.at(-1));
});
await check('damage tooltips preserve the 6.0 computed formula and Set of damage types', () => {
  const part = { number:2,denomination:6,bonus:'3',formula:'2d6 + 3',types:new Set(['fire']),custom:{enabled:false,formula:''} };
  assert.equal(buildSpellTooltipData({name:'Flame'}, {damage:{parts:[part]}}).damage, '2d6 + 3 fire');
});
function saveMessage(id, overrides = {}) {
  return { id, type: 'save', speaker: { actor: 'dragon' },
    system: { type: 'ability', resisted: false }, rolls: [{ isFailure: true, isSuccess: false }], ...overrides };
}
function resistanceActor(selected) {
  return { id: 'dragon', isOwner: true, system: { resistSave: async message => selected.push(message.id) } };
}
await check('typed saves skip resisted, successful, unknown, unrolled and other-actor messages', async () => {
  const selected = [];
  const actor = resistanceActor(selected);
  game.messages.contents = [saveMessage('eligible'), saveMessage('resisted', {system:{type:'ability',resisted:true}}),
    saveMessage('forced', {system:{type:'ability',forceSuccess:true}}),
    saveMessage('success', {rolls:[{isSuccess:true,isFailure:false}]}),
    saveMessage('unknown', {rolls:[{isSuccess:undefined,isFailure:undefined}]}),
    saveMessage('unrolled', {rolls:[]}), saveMessage('other', {speaker:{actor:'other'}})];
  await resolveHudOption({kind:'legendary-resistance',actor,available:true});
  assert.deepEqual(selected,['eligible']);
});
await check('no eligible typed save does not report success or spend a use, locally or via proxy', async () => {
  const selected=[];
  const actor=resistanceActor(selected);
  game.messages.contents=[saveMessage('already-resisted',{system:{resisted:true}})];
  assert.deepEqual(await resolveHudOption({kind:'legendary-resistance',actor,available:true}),{closed:false,ok:false});
  assert.deepEqual(await executeResolvePayload({kind:'legendary-resistance'},{actor}),{closed:false,ok:false});
  assert.deepEqual(selected,[]);
});
await check('dnd5e 6 does not send legacy cards to its typed-save-only resistance API', async () => {
  const selected=[];
  const actor=resistanceActor(selected);
  game.messages.contents=[saveMessage('eligible'),saveMessage('old-card',{type:5,flags:{dnd5e:{roll:{type:'save'}}}})];
  await resolveHudOption({kind:'legendary-resistance',actor,available:true});
  assert.deepEqual(selected,['eligible']);
});
await check('legacy saving-throw flags still work for dnd5e 5', async () => {
  const selected=[];
  const actor=resistanceActor(selected);
  game.system.version='5.3.3';
  game.messages.contents=[saveMessage('legacy',{type:5,flags:{dnd5e:{roll:{type:'save'}}}})];
  try {
    await resolveHudOption({kind:'legendary-resistance',actor,available:true});
    assert.deepEqual(selected,['legacy']);
  } finally {game.system.version='6.0.0';}
});
await check('damage models use their computed formula, not stale disabled custom data', () => {
  const part={number:2,denomination:6,formula:'2d6kh1 + 3',types:new Set(['fire']),custom:{enabled:false,formula:'99d20'}};
  assert.equal(buildSpellTooltipData({name:'Flame'},{damage:{parts:[part]}}).damage,'2d6kh1 + 3 fire');
});
await check('plain damage parts retain bonuses, dice modifiers and array damage types', () => {
  const part={number:2,denomination:6,bonus:'3',modifiers:new Set(['kh1']),types:['fire'],custom:{enabled:false,formula:'99d20'}};
  assert.equal(buildSpellTooltipData({name:'Flame'},{damage:{parts:[part]}}).damage,'2d6kh1 + 3 fire');
});
await check('legacy damage tuples still display', () => {
  assert.equal(buildSpellTooltipData({name:'Flame',system:{damage:{parts:[['1d6 + 2','fire']]}}},null).damage,'1d6 + 2 fire');
});
async function dashEffect(generation,combat) {
  game.release.generation=generation;
  game.combat=combat;
  let effect;
  await grantDashMovement({uuid:'Actor.runner',system:{attributes:{movement:{walk:30,fly:60,swim:0}}},
    createEmbeddedDocuments:async (type,data)=>{assert.equal(type,'ActiveEffect');effect=data[0];}});
  return effect;
}
await check('Foundry 14 Dash uses native system changes and a six-second duration outside combat', async () => {
  const effect=await dashEffect(14,null);
  assert.equal(effect.type,'base');
  assert.equal(effect.changes,undefined);
  assert.equal(effect.system.changes.length,2);
  assert.equal(effect.system.origin.actor,'Actor.runner');
  assert.deepEqual(effect.duration,{value:6,units:'seconds',expiry:null});
  assert.equal(effect.start.time,100);
});
await check('Foundry 14 Dash waits for the current turn-end event, with explicit start data', async () => {
  const combat={id:'battle',started:true,round:2,turn:3,combatant:{id:'runner',initiative:12}};
  const effect=await dashEffect(14,combat);
  assert.deepEqual(effect.duration,{value:0,units:'turns',expiry:'turnEnd'});
  assert.deepEqual(effect.start,{time:100,combat:'battle',combatant:'runner',initiative:12,round:2,turn:3});
});
await check('Foundry 14 Dash prefers the core start-data helper', async () => {
  const nativeStart={time:50,combat:null,combatant:null,round:null,turn:null,initiative:null};
  globalThis.ActiveEffect={implementation:{getEffectStart:combat=>{assert.equal(combat,null);return nativeStart;}}};
  try {assert.deepEqual((await dashEffect(14,null)).start,nativeStart);}
  finally {delete globalThis.ActiveEffect;}
});
await check('Foundry 13 Dash retains the legacy effect and combat-duration shape', async () => {
  const effect=await dashEffect(13,{id:'battle',started:true,round:2,turn:3});
  assert.equal(effect.system,undefined);
  assert.equal(effect.changes.length,2);
  assert.equal(effect.origin,'Actor.runner');
  assert.deepEqual(effect.duration,{combat:'battle',rounds:0,turns:1,startRound:2,startTurn:3});
});
console.log(`${passed}/${passed+failed} compatibility cases passed`);
if(failed) process.exitCode=1;
