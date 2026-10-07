/**
 * Turn the trimmed Cornholio fixture into the item shape the HUD data
 * functions already read (system.activities, preparation, equipped).
 */

/**
 * @param {object} raw
 * @returns {object}
 */
export function hydrateActor(raw) {
  const actor = {
    id: "cornholio",
    name: raw.name,
    img: raw.img || "",
    type: raw.type || "character",
    isOwner: true,
    system: raw.system || {},
    items: [],
    testUserPermission: () => true
  };

  actor.items = (raw.items ?? []).map((item, index) => hydrateItem(item, index, actor));
  return actor;
}

/**
 * dnd5e 5.x stores preparation as mode + boolean.
 * This export stored a number: 0 unprepared, 1 prepared, 2 always.
 * @param {number|boolean|null|undefined} prepared
 */
function spellPreparation(prepared) {
  if (prepared === false || prepared === 0) return { mode: "prepared", prepared: false };
  if (prepared === 2) return { mode: "always", prepared: true };
  if (prepared === true || prepared === 1) return { mode: "prepared", prepared: true };
  return { mode: "prepared", prepared: true };
}

/**
 * @param {object} raw
 * @param {number} index
 * @param {object} actor
 */
function hydrateItem(raw, index, actor) {
  const activities = {};
  (raw.activities ?? []).forEach((activity, activityIndex) => {
    const id = activity.id || `act-${activityIndex}`;
    const activation = typeof activity.activation === "string"
      ? { type: activity.activation }
      : (activity.activation ?? { type: "" });
    activities[id] = {
      ...activity,
      id,
      activation,
      img: activity.img || ""
    };
  });

  const firstType = activities[Object.keys(activities)[0]]?.activation?.type || "";
  const item = {
    id: raw.id || `item-${index}`,
    name: raw.name,
    type: raw.type,
    img: raw.img || "",
    isOwner: true,
    sort: index,
    actor,
    system: {
      identifier: raw.identifier || "",
      equipped: raw.equipped === true,
      level: raw.level ?? 0,
      quantity: raw.quantity ?? 1,
      activation: { type: raw.activation || firstType },
      activities,
      preparation: raw.type === "spell" ? spellPreparation(raw.prepared) : undefined,
      uses: raw.uses
        ? { max: raw.uses.max, spent: raw.uses.spent ?? 0 }
        : {},
      type: {
        value: raw.identifier === "unarmed-strike" ? "unarmed" : "",
        subtype: raw.subtype || ""
      },
      description: { value: "" }
    }
  };
  return item;
}
