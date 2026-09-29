const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeItemFilters, clearItemFilters } = require("../catalog-filters.js");

test("clearing item filters resets every catalog control", () => {
  assert.deepEqual(clearItemFilters(), {
    type: "",
    availability: "",
    group: "",
    equipmentCategory: "",
  });
});

test("changing item type clears filters that are hidden for the new type", () => {
  assert.deepEqual(normalizeItemFilters("equipment", {
    availability: "Легко найти",
    group: "Эфир",
    equipmentCategory: "Доспехи",
  }, { equipmentCategory: true }), {
    availability: "",
    group: "",
    equipmentCategory: "Доспехи",
  });
});

test("a dependent filter is cleared when its options make its control hidden", () => {
  assert.deepEqual(normalizeItemFilters("ingredient", {
    availability: "Легко найти",
    group: "Эфир",
    equipmentCategory: "Доспехи",
  }, { availability: false, group: true, equipmentCategory: false }), {
    availability: "",
    group: "Эфир",
    equipmentCategory: "",
  });
});
