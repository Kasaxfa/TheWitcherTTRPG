(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CatalogView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createCatalogView({ recipes, alchemySymbols, itemById, resolveItemId, escapeHtml, numberText }) {
    function formula(ingredients) {
      const relevant = ingredients.filter(ingredient => alchemySymbols[ingredient.itemId]);
      if (!relevant.length) return "";
      const label = relevant.map(ingredient => `${alchemySymbols[ingredient.itemId].name}, ${ingredient.quantity} шт.`).join("; ");
      const symbols = relevant.map(ingredient => {
        const symbol = alchemySymbols[ingredient.itemId];
        const count = Number(ingredient.quantity);
        if (!Number.isInteger(count) || count < 1 || count > 30) return "";
        return Array.from({ length: count }, () => `<svg class="alchemy-symbol" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="${escapeHtml(symbol.color)}"/><path d="${escapeHtml(symbol.path)}" fill="none" stroke="white" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`).join("");
      }).join("");
      return `<span class="formula" role="img" aria-label="Формула: ${escapeHtml(label)}">${symbols}</span>`;
    }

    function recipeCard(recipe, selectedId) {
      const ingredients = recipe.ingredients || [];
      const preview = recipe.type === "alchemy" ? formula(ingredients)
        : ingredients.slice(0, 3).map(ingredient => escapeHtml(ingredient.name)).join(" · ") + (ingredients.length > 3 ? ` · +${ingredients.length - 3}` : "");
      const dc = recipe.dc ? `<span class="meta-pill"><strong>СЛ</strong>${escapeHtml(recipe.dc)}</span>` : "";
      const time = recipe.time ? `<span class="meta-pill time"><strong>Время</strong>${escapeHtml(recipe.time)}</span>` : "";
      return `<button type="button" class="recipe-card recipe-summary${selectedId === recipe.id ? " is-selected" : ""}" data-recipe-id="${escapeHtml(recipe.id)}" aria-pressed="${selectedId === recipe.id}">
        <span class="recipe-title-block"><span class="recipe-title">${escapeHtml(recipe.name)}</span><span class="recipe-kind">${recipe.type === "alchemy" ? "Алхимия" : "Ремесло"}</span></span>
        <span class="ingredient-preview">${preview || "Состав не указан"}</span>${dc}${time}</button>`;
    }

    function recipeDetail(recipe) {
      const ingredients = recipe.ingredients || [];
      const outputs = (recipe.outputs || []).map(output => {
        const label = `${escapeHtml(output.name)}${output.quantity !== 1 ? ` ×${escapeHtml(output.quantity)}` : ""}`;
        return output.itemId ? `<button type="button" class="catalog-inline-link" data-open-catalog-item="${escapeHtml(output.itemId)}">${label}</button>` : `<span>${label}</span>`;
      }).join(" ");
      const componentRows = ingredients.map(ingredient => {
        const label = `${escapeHtml(ingredient.name)}${ingredient.quantity ? ` ×${escapeHtml(ingredient.quantity)}` : ""}`;
        return ingredient.itemId ? `<button type="button" class="ingredient-tag catalog-inline-link" data-open-catalog-item="${escapeHtml(ingredient.itemId)}">${label}</button>` : `<span class="ingredient-tag">${label}</span>`;
      }).join("") || `<span class="detail-value">Не указаны</span>`;
      const outputEffects = (recipe.outputs || []).flatMap(output => {
        const item = output.itemId ? itemById.get(resolveItemId(output.itemId)) : null;
        return (item?.effects || []).map(effect => `<p>${escapeHtml(effect.text)}${effect.duration ? ` · ${escapeHtml(effect.duration)}` : ""}</p>`)
          .concat(item?.details?.effect ? `<p>${escapeHtml(item.details.effect)}</p>` : []);
      });
      return `<div class="catalog-detail-inner">
        <div class="catalog-detail-kicker">${recipe.type === "alchemy" ? "Алхимический рецепт" : "Ремесленный чертёж"}</div>
        <h2>${escapeHtml(recipe.name)}</h2><p class="catalog-detail-subtitle">Рецепт для изготовления</p><div class="catalog-detail-divider"></div>
        <div class="detail-label">Параметры</div><div class="recipe-detail-metrics">
          <div class="recipe-metric"><span>Сложность</span><strong>СЛ ${escapeHtml(recipe.dc || "—")}</strong></div>
          <div class="recipe-metric"><span>Время</span><strong>${escapeHtml(recipe.time || "—")}</strong></div>
          <div class="recipe-metric"><span>Уровень</span><strong>${escapeHtml(recipe.tier || "—")}</strong></div>
        </div>
        <div class="detail-block"><span class="detail-label">Компоненты</span><div class="ingredient-list">${componentRows}</div></div>
        ${recipe.type === "alchemy" ? `<div class="detail-block"><span class="detail-label">Формула · символы ингредиентов</span>${formula(ingredients)}</div>` : ""}
        ${outputEffects.length ? `<div class="detail-block"><span class="detail-label">Эффект</span>${outputEffects.join("")}</div>` : ""}
        ${(recipe.outputs || []).length ? `<div class="detail-block"><span class="detail-label">Результат</span><div class="ingredient-list">${outputs}</div></div>` : ""}
        ${recipe.priceCrowns !== null && recipe.priceCrowns !== undefined ? `<div class="detail-block"><span class="detail-label">Цена</span><p>${numberText(recipe.priceCrowns)} кр.</p></div>` : ""}
        ${recipe.surchargeCrowns !== null && recipe.surchargeCrowns !== undefined ? `<div class="detail-block"><span class="detail-label">Доплата за изготовление</span><p>${numberText(recipe.surchargeCrowns)} кр.</p></div>` : ""}
      </div>`;
    }

    function fieldValue(value, unit) {
      if (value === null || value === undefined || value === "") return "Не указано";
      return `${escapeHtml(value)}${unit ? ` ${escapeHtml(unit)}` : ""}`;
    }

    function itemCard(item, selectedId) {
      const quick = [];
      if (item.weightKg !== null) quick.push(`<span><strong>Вес</strong> ${numberText(item.weightKg)} кг</span>`);
      if (item.costCrowns !== null) quick.push(`<span><strong>Цена</strong> ${numberText(item.costCrowns)} кр.</span>`);
      return `<button type="button" class="item-card item-summary${selectedId === item.id ? " is-selected" : ""}" data-item-id="${escapeHtml(item.id)}" aria-pressed="${selectedId === item.id}"><span class="item-name">${escapeHtml(item.name)}</span><span class="item-kind">${escapeHtml(item.typeLabel)}</span><span class="item-quick-meta">${quick.join("") || "Сведения о весе и цене отсутствуют"}</span></button>`;
    }

    function itemDetail(item) {
      const details = item.details || {};
      const narrative = Object.entries(details).filter(([, value]) => value !== null && value !== "").map(([key, value]) => {
        const labels = { where_found: "Где найти", availability: "Доступность", acquisition_method: "Где найти", alchemy_group: "Группа", effect: "Эффект", duration: "Длительность", toxicity: "Токсичность", application: "Применение", notes: "Примечание" };
        return `<div class="detail-block"><span class="detail-label">${labels[key] || escapeHtml(key)}</span><p>${escapeHtml(value)}</p></div>`;
      }).join("");
      const attributes = item.attributes?.length ? `<div class="detail-block"><span class="detail-label">Характеристики</span><div class="attribute-list">${item.attributes.map(attribute => `<div class="attribute-row"><span>${escapeHtml(attribute.label)}</span><strong>${fieldValue(attribute.value, attribute.unit)}</strong></div>`).join("")}</div></div>` : "";
      const effects = item.effects?.length ? `<div class="detail-block"><span class="detail-label">Эффекты</span>${item.effects.map(effect => `<p>${escapeHtml(effect.text)}${effect.duration ? ` · ${escapeHtml(effect.duration)}` : ""}</p>`).join("")}</div>` : "";
      const description = item.description ? `<div class="detail-block"><span class="detail-label">Описание</span><p>${escapeHtml(item.description)}</p></div>` : "";
      const related = recipes.filter(recipe => (recipe.ingredients || []).some(entry => entry.itemId === item.id) || (recipe.outputs || []).some(entry => entry.itemId === item.id));
      const relatedRecipes = related.length ? `<div class="detail-block"><span class="detail-label">Связанные рецепты и чертежи</span><div class="related-recipe-links">${related.map(recipe => `<button type="button" class="catalog-inline-link" data-open-recipe="${escapeHtml(recipe.id)}">${escapeHtml(recipe.name)} · ${recipe.type === "alchemy" ? "Алхимия" : "Ремесло"}</button>`).join("")}</div></div>` : "";
      const quick = [];
      if (item.weightKg !== null) quick.push(`<div class="recipe-metric"><span>Вес</span><strong>${numberText(item.weightKg)} кг</strong></div>`);
      if (item.costCrowns !== null) quick.push(`<div class="recipe-metric"><span>Цена</span><strong>${numberText(item.costCrowns)} кр.</strong></div>`);
      return `<div class="catalog-detail-inner"><div class="catalog-detail-kicker">${escapeHtml(item.typeLabel)}</div><h2>${escapeHtml(item.name)}</h2>
        ${quick.length ? `<div class="item-detail-metrics">${quick.join("")}</div>` : ""}${description}${narrative}${attributes}${effects}${relatedRecipes}</div>`;
    }

    return Object.freeze({ formula, recipeCard, recipeDetail, itemCard, itemDetail });
  }

  return Object.freeze({ createCatalogView });
});
