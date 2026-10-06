globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3, OBSERVER: 2, LIMITED: 1 } };
globalThis.game = {
  i18n: { format: (k) => k },
  user: { id: "U1", isGM: false },
  users: { get: (id) => ({ id, isGM: id === "GM", testUserPermission: () => false }) },
  modules: { get: () => ({ active: true }) }
};

const { canOpenHud, canResolveLocally } = await import("../data/permissions.mjs");
const { assertRequesterMayProxy, userHasObserver } = await import("../net/socket.mjs");

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

console.log(`\n${n} assertions passed`);
