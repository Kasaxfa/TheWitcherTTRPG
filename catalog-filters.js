(() => {
  function normalizeItemFilters(type, filters, visible = {}) {
    const ingredients = type === "ingredient";
    const equipment = type === "equipment";
    return {
      availability: ingredients && visible.availability ? filters.availability || "" : "",
      group: ingredients && visible.group ? filters.group || "" : "",
      equipmentCategory: equipment && visible.equipmentCategory ? filters.equipmentCategory || "" : "",
    };
  }

  function clearItemFilters() {
    return { type: "", availability: "", group: "", equipmentCategory: "" };
  }

  const api = { normalizeItemFilters, clearItemFilters };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CatalogFilters = api;
})();
