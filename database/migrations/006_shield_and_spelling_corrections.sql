BEGIN IMMEDIATE;

-- P. 135 calls both craftable shields pavises, not cuirasses. Keep their
-- original recipe-output IDs and redirect the unlinked equipment duplicates.
INSERT INTO item_id_aliases(retired_item_id, current_item_id, reason)
SELECT item_id, 'item_85141b15216c12a1fd09', 'Павеза, стр. 135'
FROM items WHERE name='Павеза' AND item_type='armor'
  AND item_id != 'item_85141b15216c12a1fd09';
DELETE FROM items WHERE name='Павеза' AND item_type='armor'
  AND item_id != 'item_85141b15216c12a1fd09';
UPDATE items SET name='Павеза' WHERE item_id='item_85141b15216c12a1fd09';
UPDATE recipes SET title='Павеза' WHERE title='Панцирь' AND recipe_type='armor';

INSERT INTO item_id_aliases(retired_item_id, current_item_id, reason)
SELECT item_id, 'item_5f91a8ddc7abffa50de9', 'Нильфгаардская павеза, стр. 135'
FROM items WHERE name='Нильфгаардская павеза' AND item_type='armor'
  AND item_id != 'item_5f91a8ddc7abffa50de9';
DELETE FROM items WHERE name='Нильфгаардская павеза' AND item_type='armor'
  AND item_id != 'item_5f91a8ddc7abffa50de9';
UPDATE items SET name='Нильфгаардская павеза'
WHERE item_id='item_5f91a8ddc7abffa50de9';
UPDATE recipes SET title='Нильфгаардская павеза'
WHERE title='Нильфгаардская панцирь' AND recipe_type='armor';

-- Names checked against printed blueprint headings on pp. 131 and 135.
UPDATE items SET name='Гледдиф' WHERE item_id='item_b3c5249ae26fd634dd79';
UPDATE recipes SET title='Гледдиф' WHERE title='Гледиф' AND recipe_type='weapon';
UPDATE items SET name='Топфхельм' WHERE name='Тонфелль' AND item_type='armor';
UPDATE recipes SET title='Топфхельм' WHERE title='Тонфелль' AND recipe_type='armor';
UPDATE items SET name=replace(name,'Хиндарфьяльск','Хиндарсфьяльск')
WHERE name LIKE 'Хиндарфьяльск%';
UPDATE recipes SET title=replace(title,'Хиндарфьяльск','Хиндарсфьяльск')
WHERE title LIKE 'Хиндарфьяльск%';

PRAGMA user_version = 6;
COMMIT;
