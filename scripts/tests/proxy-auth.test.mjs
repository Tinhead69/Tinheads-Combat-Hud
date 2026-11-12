import assertNode from "node:assert/strict";

globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3, OBSERVER: 2, LIMITED: 1 } };
globalThis.game = {
  i18n: { format: (k) => k },
  user: { id: "U1", isGM: false },
  users: { get: (id) => ({ id, isGM: id === "GM", testUserPermission: () => false }) },
  modules: { get: () => ({ active: true }) }
};

const { canOpenHud, canResolveLocally } = await import("../data/permissions.mjs");
const { assertRequesterMayProxy, registerSocket, SOCKET_HANDLERS, userHasObserver } = await import("../net/socket.mjs");

let n = 0;
const assert = (c, m) => { if (!c) throw new Error(m); n++; console.log("ok:", m); };

const actor = {
  isOwner: false,
  testUserPermission: (user, level) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER || level === "OBSERVER"
};
assert(canOpenHud(actor), "observer can open");
assert(!canResolveLocally(actor), "observer cannot resolve locally");
game.user.isGM = true;
assert(canResolveLocally(actor), "GM resolves locally");
game.user.isGM = false;

const requester = { id: "U1", isGM: false };
assert(userHasObserver(actor, requester), "observer check");
assertRequesterMayProxy(requester, actor);
assert(true, "observer may proxy");
let threw = false;
try { assertRequesterMayProxy(requester, { isOwner: false, testUserPermission: () => false }); }
catch { threw = true; }
assert(threw, "limited cannot proxy");

const handlers = new Map();
globalThis.socketlib = { registerModule: () => ({ register: (name, fn) => handlers.set(name, fn) }) };
registerSocket();

const actorUuid = "Scene.test.Token.first.Actor.npc";
const itemUuid = `${actorUuid}.Item.weapon`;
const activity = { id: "attack", type: "attack" };
Object.assign(actor, { uuid: actorUuid, documentName: "Actor" });
const item = { documentName: "Item", actor, system: { activities: new Map([[activity.id, activity]]) } };
globalThis.fromUuid = async uuid => new Map([[actorUuid, actor], [itemUuid, item]]).get(uuid);
game.users = new Map([[requester.id, requester]]);
game.user = { id: "GM", isGM: true, targets: new Set([{ document: { uuid: "Scene.test.Token.gmTarget" } }]) };
const rolls = [];
globalThis.MidiQOL = { completeActivityUse: async (_, { midiOptions }) => { rolls.push(midiOptions); } };

const resolve = handlers.get(SOCKET_HANDLERS.resolve);
const sender = { socketdata: { userId: requester.id } };
const attack = { actorUuid, itemUuid, activityId: activity.id, kind: "weapon" };
for (const targetUuids of [["Scene.test.Token.playerTarget"], []]) {
  const result = await resolve.call(sender, { ...attack, targetUuids });
  assert(result.ok, "socketlib sender can use the authorized actor's own item");
  assertNode.deepEqual(rolls.at(-1), { targetUuids, ignoreUserTargets: true });
}

const { executeResolvePayload } = await import("../data/resolve.mjs");
await assertNode.rejects(executeResolvePayload(attack, { actor: { uuid: "Scene.test.Token.second.Actor.npc" } }), /Proxy\.Unauthorized/);
assert(rolls.length === 2, "proxy refuses an item from another token with the same base actor ID");

let advanced = false;
actor.testUserPermission = (user, level) => user === requester && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
game.combat = { uuid: "Combat.current", combatant: { actor }, nextTurn: async () => { advanced = true; } };
const endTurn = handlers.get(SOCKET_HANDLERS.endTurn);
assert(!(await endTurn.call(sender, { combatUuid: "Combat.previous" })).ok && !advanced, "a delayed request cannot advance a different combat");
assert((await endTurn.call(sender, { combatUuid: game.combat.uuid })).ok && advanced, "the socketlib sender can advance their own turn");

console.log(`\n${n} assertions passed`);
