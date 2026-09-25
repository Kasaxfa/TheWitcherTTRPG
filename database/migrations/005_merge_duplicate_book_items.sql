BEGIN IMMEDIATE;

-- Preserve retired IDs so inventory imports can resolve references created before
-- these book-based corrections. A retired ID never becomes a live item again.
CREATE TABLE item_id_aliases (
    retired_item_id TEXT PRIMARY KEY,
    current_item_id TEXT NOT NULL REFERENCES items(item_id),
    reason TEXT NOT NULL,
    CHECK (retired_item_id != current_item_id)
);

-- Page 132 names the crafted weapon "Посох". An unlinked duplicate was
-- introduced when its equipment stats were first imported.
INSERT INTO item_id_aliases(retired_item_id, current_item_id, reason)
SELECT item_id, 'item_df60d5128dc9a1a6e3d5', 'Дубликат посоха, стр. 132'
FROM items WHERE name='Посох' AND item_type='weapon'
  AND item_id != 'item_df60d5128dc9a1a6e3d5';
DELETE FROM items WHERE name='Посох' AND item_type='weapon'
  AND item_id != 'item_df60d5128dc9a1a6e3d5';
UPDATE items SET name='Посох' WHERE item_id='item_df60d5128dc9a1a6e3d5';
UPDATE recipes SET title='Посох' WHERE title='Плос' AND recipe_type='weapon';

-- The component list (p. 128) and the blueprint (p. 130) refer to the same
-- dragonid leather. Retain the ingredient ID because it has verified weight
-- and cost; redirect its crafting output and the one downstream recipe.
INSERT INTO item_id_aliases(retired_item_id, current_item_id, reason)
VALUES ('item_e83c05dce246bdf3fcbc', 'item_4e9c7897668eb8f07d87',
        'Кожа драконида: один предмет на стр. 128 и 130');
INSERT OR IGNORE INTO item_sources(item_id, source_id, page_number, source_role)
SELECT 'item_4e9c7897668eb8f07d87', source_id, page_number, source_role
FROM item_sources WHERE item_id='item_e83c05dce246bdf3fcbc';
UPDATE recipe_outputs SET item_id='item_4e9c7897668eb8f07d87'
WHERE item_id='item_e83c05dce246bdf3fcbc';
UPDATE recipe_ingredients SET item_id='item_4e9c7897668eb8f07d87'
WHERE item_id='item_e83c05dce246bdf3fcbc';
DELETE FROM items WHERE item_id='item_e83c05dce246bdf3fcbc';
UPDATE recipes SET title='Кожа драконида'
WHERE title='Кожа дракона' AND recipe_type='material';

-- Weapon name as printed on p. 132 and in the weapon list.
UPDATE items SET name='Кригсверд' WHERE item_id='item_c5575c849263a4c692b6';
UPDATE recipes SET title='Кригсверд'
WHERE title='Кригсвер' AND recipe_type='weapon';

PRAGMA user_version = 5;
COMMIT;
