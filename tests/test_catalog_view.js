const assert = require("node:assert/strict");
const test = require("node:test");
const { createCatalogView } = require("../catalog-view.js");

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const recipes = [{ id: "potion-a", name: "Зелье <А>", type: "alchemy", ingredients: [{ itemId: "herb", name: "Трава", quantity: 2 }], outputs: [{ itemId: "potion", name: "Эликсир" }], dc: 15, time: "1 час", tier: "Новичок", priceCrowns: null, surchargeCrowns: null }];
const items = new Map([ ["potion", { id: "potion", effects: [{ text: "Эффект", duration: "час" }], details: {} }] ]);
const view = createCatalogView({ recipes, items, itemById: items, alchemySymbols: { herb: { name: "Трава", color: "#123456", path: "M2 2" } }, resolveItemId: id => id, escapeHtml, numberText: value => String(value) });

test("catalog list templates escape names and keep selection semantics", () => {
  const html = view.recipeCard(recipes[0], recipes[0].id);
  assert.match(html, /Зелье &lt;А&gt;/);
  assert.match(html, /class="recipe-card recipe-summary is-selected"/);
  assert.match(html, /aria-pressed="true"/);
});

test("alchemy detail keeps visual ingredient formula and clickable catalogue references", () => {
  const html = view.recipeDetail(recipes[0]);
  assert.equal((html.match(/class="alchemy-symbol"/g) || []).length, 2);
  assert.match(html, /data-open-catalog-item="herb"/);
  assert.match(html, /data-open-catalog-item="potion"/);
  assert.match(html, /data-open-catalog-item="potion"[^>]*>Эликсир/);
});

test("item detail shows its effects and linked recipes", () => {
  const html = view.itemDetail({ id: "potion", name: "Эликсир", typeLabel: "Алхимическое средство", details: {}, attributes: [], effects: [{ text: "Укрепляет", duration: "2 часа" }], description: "Кратко", weightKg: 0.1, costCrowns: 3 });
  assert.match(html, /Укрепляет · 2 часа/);
  assert.match(html, /data-open-recipe="potion-a"/);
  assert.match(html, /Связанные рецепты и чертежи/);
});
