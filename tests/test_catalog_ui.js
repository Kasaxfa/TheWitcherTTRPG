const test = require("node:test");
const assert = require("node:assert/strict");
const { catalogViewIds } = require("../catalog-ui.js");

test("mobile catalog navigation resolves the recipe DOM IDs", () => {
  assert.deepEqual(catalogViewIds("recipes"), {
    listId: "recipe-list",
    detailId: "recipe-detail",
  });
});

test("mobile catalog navigation resolves the item DOM IDs", () => {
  assert.deepEqual(catalogViewIds("items"), {
    listId: "item-list",
    detailId: "item-detail",
  });
});

test("unknown catalog view names fail explicitly", () => {
  assert.throws(() => catalogViewIds("recipe"), RangeError);
});
