BEGIN IMMEDIATE;
ALTER TABLE ingredient_details RENAME COLUMN habitat TO where_found;
ALTER TABLE ingredient_details RENAME COLUMN rarity TO availability;
ALTER TABLE item_field_sources RENAME TO item_field_sources_v8;
CREATE TABLE item_field_sources (
    item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    field_name TEXT NOT NULL CHECK (field_name IN (
        'description', 'weight_kg', 'cost_crowns', 'where_found', 'availability',
        'acquisition_method', 'alchemy_group', 'notes', 'effect',
        'duration', 'toxicity', 'application')),
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    PRIMARY KEY (item_id, field_name, source_id, page_number)
);
INSERT INTO item_field_sources(item_id,field_name,source_id,page_number)
SELECT item_id,
       CASE field_name WHEN 'habitat' THEN 'where_found'
                       WHEN 'rarity' THEN 'availability'
                       ELSE field_name END,
       source_id,page_number
FROM item_field_sources_v8;
DROP TABLE item_field_sources_v8;

UPDATE items SET name='Calcium equum'
WHERE item_id='item_047fda02ae7041f398379db95ef16133';
UPDATE items SET name='Optima mater'
WHERE item_id='item_524a9eabd5bf45d4ab85e3fbb88783ed';
UPDATE items SET name='Обезболивающие травы'
WHERE item_id='item_8784ebdce5d9f494be56';
UPDATE recipes SET title='Обезболивающие травы'
WHERE recipe_id='recipe_7ab8939f8d70f43851ea';
UPDATE items SET weight_kg=NULL
WHERE item_id='item_04f5854aa0cd47109d5d8040acb38211';
DELETE FROM item_field_sources
WHERE item_id='item_04f5854aa0cd47109d5d8040acb38211'
  AND field_name='weight_kg';
DELETE FROM recipe_sources
WHERE recipe_id='recipe_bb3fbf1f580f7aeff5cb'
  AND page_number=136;

PRAGMA user_version=9;
COMMIT;
PRAGMA foreign_keys=ON;
