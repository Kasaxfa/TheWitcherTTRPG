BEGIN IMMEDIATE;

-- IDs are permanent references for inventories and must survive display edits.
CREATE TRIGGER prevent_item_id_change BEFORE UPDATE OF item_id ON items
BEGIN SELECT RAISE(ABORT, 'item_id is immutable'); END;
CREATE TRIGGER prevent_recipe_id_change BEFORE UPDATE OF recipe_id ON recipes
BEGIN SELECT RAISE(ABORT, 'recipe_id is immutable'); END;

-- Link choices must be recorded whenever an ingredient name has several item IDs.
CREATE TABLE ingredient_link_decisions (
    recipe_id TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(item_id),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    PRIMARY KEY (recipe_id, line_number),
    FOREIGN KEY (recipe_id, line_number)
        REFERENCES recipe_ingredients(recipe_id, line_number) ON DELETE CASCADE
);
CREATE TRIGGER verify_ingredient_link_decision_insert
BEFORE INSERT ON ingredient_link_decisions
WHEN NEW.item_id != (SELECT item_id FROM recipe_ingredients
                    WHERE recipe_id = NEW.recipe_id AND line_number = NEW.line_number)
BEGIN SELECT RAISE(ABORT, 'ingredient link decision does not match the recipe'); END;
CREATE TRIGGER verify_ingredient_link_decision_update
BEFORE UPDATE OF item_id, recipe_id, line_number ON ingredient_link_decisions
WHEN NEW.item_id != (SELECT item_id FROM recipe_ingredients
                    WHERE recipe_id = NEW.recipe_id AND line_number = NEW.line_number)
BEGIN SELECT RAISE(ABORT, 'ingredient link decision does not match the recipe'); END;
CREATE TRIGGER prevent_ingredient_link_drift
BEFORE UPDATE OF item_id ON recipe_ingredients
WHEN EXISTS (SELECT 1 FROM ingredient_link_decisions d
             WHERE d.recipe_id = OLD.recipe_id AND d.line_number = OLD.line_number
               AND d.item_id != NEW.item_id)
BEGIN SELECT RAISE(ABORT, 'update the ingredient link decision first'); END;

INSERT INTO ingredient_link_decisions (recipe_id, line_number, item_id, reason)
SELECT ri.recipe_id, ri.line_number, ri.item_id,
       'Рецепт требует ремесленный материал; одноимённая броня является другим предметом'
FROM recipe_ingredients ri JOIN items i ON i.item_id = ri.item_id
WHERE i.name = 'Укреплённая кожа' AND i.item_type = 'material'
  AND (SELECT COUNT(*) FROM items other WHERE other.name = i.name) > 1;

-- Each value copied from the book has its own page, including weight/cost.
CREATE TABLE item_field_sources (
    item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    field_name TEXT NOT NULL CHECK (field_name IN (
        'description', 'weight_kg', 'cost_crowns', 'habitat', 'rarity',
        'acquisition_method', 'alchemy_group', 'notes', 'effect',
        'duration', 'toxicity', 'application')),
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    PRIMARY KEY (item_id, field_name, source_id, page_number)
);

PRAGMA user_version = 2;
COMMIT;
