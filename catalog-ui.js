(() => {
  const catalogViews = {
    recipes: { listId: "recipe-list", detailId: "recipe-detail" },
    items: { listId: "item-list", detailId: "item-detail" },
  };

  function catalogViewIds(kind) {
    const ids = catalogViews[kind];
    if (!ids) throw new RangeError(`Unknown catalog view: ${kind}`);
    return { ...ids };
  }

  const api = { catalogViewIds };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CatalogUi = api;
})();
