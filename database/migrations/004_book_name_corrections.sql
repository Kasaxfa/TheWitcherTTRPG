BEGIN IMMEDIATE;

-- Correct transcription errors against printed tables, retaining original IDs.
UPDATE items SET name = 'Ребис' WHERE name = 'Рубедо' AND item_type = 'ingredient'; -- p. 142-143
UPDATE items SET name = 'Чернящее масло' WHERE name = 'Чёрное масло' AND item_type = 'ingredient'; -- p. 129
UPDATE items SET name = 'Чешуя драконида' WHERE name = 'Чешуя дракона' AND item_type = 'ingredient'; -- p. 128
UPDATE items SET name = 'Зерриканский огонь' WHERE name = 'Зеркальный огонь' AND item_type = 'alchemical'; -- p. 88
UPDATE items SET name = 'Слёзы Тальгара' WHERE name = 'Слёзы Тальгра' AND item_type = 'alchemical'; -- p. 88
UPDATE items SET name = 'Эликсир Пантаграна' WHERE name = 'Эликсир Пантангара' AND item_type = 'alchemical'; -- p. 88
UPDATE items SET name = 'Торрур' WHERE name = 'Торру' AND item_type = 'weapon'; -- p. 73
UPDATE items SET name = 'Клинок бригады «Врихед»' WHERE name = 'Клинок бригады «Вихред»' AND item_type = 'weapon'; -- p. 83

UPDATE recipes SET title = 'Зерриканский огонь' WHERE title = 'Зеркальный огонь' AND recipe_type = 'alchemy';
UPDATE recipes SET title = 'Слёзы Тальгара' WHERE title = 'Слёзы Тальгра' AND recipe_type = 'alchemy';
UPDATE recipes SET title = 'Эликсир Пантаграна' WHERE title = 'Эликсир Пантангара' AND recipe_type = 'alchemy';
UPDATE recipes SET title = 'Торрур' WHERE title = 'Торру' AND recipe_type = 'weapon';
UPDATE recipes SET title = 'Клинок бригады «Врихед»' WHERE title = 'Клинок бригады «Вихред»' AND recipe_type = 'weapon';

PRAGMA user_version = 4;
COMMIT;
