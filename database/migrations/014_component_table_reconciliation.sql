BEGIN IMMEDIATE;
-- Написание материалов по таблицам компонентов и чертежей, с сохранением ID.
UPDATE items SET name='Двимерит' WHERE item_id='item_750e7ca248c20931af6b';
UPDATE items SET name='Махакамский двимерит' WHERE item_id='item_8fc9d1da3476bea64e22';
UPDATE items SET name='Махакамская сталь' WHERE item_id='item_d747d12d6dec4318743c';
UPDATE items SET name='Третогорская сталь' WHERE item_id='item_639060dfddf5da8869e4';
UPDATE items SET name='Самоцветы' WHERE item_id='item_74e9b1c64311635ec1de';
UPDATE recipes SET title = (
    SELECT i.name FROM recipe_outputs o JOIN items i USING(item_id)
    WHERE o.recipe_id=recipes.recipe_id LIMIT 1
) WHERE recipe_id IN (
    SELECT recipe_id FROM recipe_outputs WHERE item_id IN (
        'item_750e7ca248c20931af6b', 'item_8fc9d1da3476bea64e22',
        'item_d747d12d6dec4318743c', 'item_639060dfddf5da8869e4'
    )
);

-- Стр. 133: количества и пропущенные компоненты в чертежах оружия.
UPDATE recipe_ingredients SET quantity=1 WHERE recipe_id='recipe_f1d0abf19c44817d301a' AND line_number=2;
UPDATE recipe_ingredients SET line_number=8 WHERE recipe_id='recipe_4ea0890f82f99480622b' AND line_number=7;
INSERT INTO recipe_ingredients(recipe_id,line_number,item_id,quantity) VALUES
    ('recipe_4ea0890f82f99480622b',7,'item_a27ffa903164ed2b379f',2);
UPDATE recipe_ingredients SET quantity=4 WHERE recipe_id='recipe_8546ba9e73b22d4f7913' AND line_number=2;
UPDATE recipe_ingredients SET quantity=3 WHERE recipe_id='recipe_810065109a57b27591c7' AND line_number=3;

-- Арбалет охотника на чудовищ: эфирная смазка перед воском.
UPDATE recipe_ingredients SET line_number=10 WHERE recipe_id='recipe_336d7a6dcefb41125754' AND line_number=9;
UPDATE recipe_ingredients SET line_number=9 WHERE recipe_id='recipe_336d7a6dcefb41125754' AND line_number=8;
UPDATE recipe_ingredients SET line_number=8 WHERE recipe_id='recipe_336d7a6dcefb41125754' AND line_number=7;
UPDATE recipe_ingredients SET line_number=7 WHERE recipe_id='recipe_336d7a6dcefb41125754' AND line_number=6;
INSERT INTO recipe_ingredients(recipe_id,line_number,item_id,quantity) VALUES
    ('recipe_336d7a6dcefb41125754',6,'item_803aeb9e60ba3d98cce6',2);

-- Стр. 135: в нильфгаардских чертежах именно пепел, а не перья.
UPDATE recipe_ingredients SET item_id='item_6282540f5cf5a0f9692d'
WHERE (recipe_id='recipe_4907fda1e928930f0335' AND line_number=2)
   OR (recipe_id='recipe_848e9a2280b710f23b3f' AND line_number=7)
   OR (recipe_id='recipe_77a8158473261b09d03a' AND line_number=7)
   OR (recipe_id='recipe_657deaf4c1d70021e808' AND line_number=2)
   OR (recipe_id='recipe_25fa64ceb20b52dbc7a0' AND line_number=5);
UPDATE recipe_ingredients SET line_number=8 WHERE recipe_id='recipe_4907fda1e928930f0335' AND line_number=7;
UPDATE recipe_ingredients SET line_number=7 WHERE recipe_id='recipe_4907fda1e928930f0335' AND line_number=6;
INSERT INTO recipe_ingredients(recipe_id,line_number,item_id,quantity) VALUES
    ('recipe_4907fda1e928930f0335',6,'item_25b42504503f4aafea64',4);

-- Стр. 137, 139: точные строки Старшего Народа и усиления брони.
DELETE FROM recipe_ingredients WHERE recipe_id='recipe_b07dc0af486fd17b0a49' AND line_number=9;
UPDATE recipe_ingredients SET quantity=1 WHERE recipe_id='recipe_a91df62f23e653b8aae3' AND line_number=2;
UPDATE recipe_ingredients SET line_number=8 WHERE recipe_id='recipe_f0ac68b423358532fe54' AND line_number=7;
UPDATE recipe_ingredients SET line_number=7 WHERE recipe_id='recipe_f0ac68b423358532fe54' AND line_number=6;
UPDATE recipe_ingredients SET line_number=6 WHERE recipe_id='recipe_f0ac68b423358532fe54' AND line_number=5;
UPDATE recipe_ingredients SET line_number=5 WHERE recipe_id='recipe_f0ac68b423358532fe54' AND line_number=4;
INSERT INTO recipe_ingredients(recipe_id,line_number,item_id,quantity) VALUES
    ('recipe_f0ac68b423358532fe54',4,'item_803aeb9e60ba3d98cce6',1);
UPDATE recipe_ingredients SET quantity=1 WHERE recipe_id='recipe_9ff56667eba3a5a5cb2e' AND line_number=3;

PRAGMA user_version=14;
COMMIT;
