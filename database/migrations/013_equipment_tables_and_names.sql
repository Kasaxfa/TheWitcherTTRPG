BEGIN IMMEDIATE;
INSERT INTO item_types(item_type, label) VALUES ('transport', 'Скакуны и транспорт');
INSERT INTO attribute_definitions(attribute_code, label, value_kind, unit) VALUES
    ('capacity_kg', 'Грузовместимость', 'number', 'кг'),
    ('athletics_dex', 'Атлетика + Лвк', 'number', NULL),
    ('control_modifier', 'Модификатор управления', 'number', NULL),
    ('speed', 'Скорость', 'text', NULL),
    ('hit_points', 'Пункты здоровья', 'number', NULL);

-- Сохраняем идентификаторы предметов и связи рецептов при исправлении написания.
UPDATE items SET name = 'Клинок из Виковаро' WHERE item_id = 'item_ee837e2daed9957715c3';
UPDATE items SET name = 'Джамбия' WHERE item_id = 'item_45a08ea4b3f20f66cbae';
UPDATE items SET name = 'Клинок бригады «Врихедд»' WHERE item_id = 'item_09dd41c61be9dbf82437';
UPDATE items SET name = 'Краснолюдский секач' WHERE item_id = 'item_4e8420c10fd69bfc4451';
UPDATE items SET name = 'Махакамский мартель' WHERE item_id = 'item_2ce91c1d348060d35dac';
UPDATE items SET name = 'Капюшон вердэнского лучника' WHERE item_id = 'item_e421f303955f0febc6fe';
UPDATE items SET name = 'Хиндарсфьяльские тяжёлые шоссы' WHERE item_id = 'item_16cd7482ecdd9ef4213d';
UPDATE items SET name = 'Каэдвенский щит' WHERE item_id = 'item_010f8e54ccd4c3d0a3b6';
UPDATE items SET name = 'Махакамские латы' WHERE item_id = 'item_b8c44c37e3d3d724806f';
UPDATE items SET name = 'Махакамская павеза' WHERE item_id = 'item_a5f62af7a444e5a8770f';
UPDATE items SET name = 'Броня скоя’таэля' WHERE item_id = 'item_17411ca4f734ba75a3f7';
UPDATE items SET name = 'Эльфские ввинчивающиеся стрелы' WHERE item_id = 'item_6d82db782aabe22ad36d';
UPDATE items SET name = 'Фисштех' WHERE item_id = 'item_d1c57a0a9a154038897a';
UPDATE items SET name = 'Ярость Бредана' WHERE item_id = 'item_ae53589ddcce1c2e9ab5';
UPDATE items SET name = 'Кровосвёртывающий порошок' WHERE item_id = 'item_be70f9a9f07ef034f398';

UPDATE recipes SET title = (SELECT i.name FROM recipe_outputs o JOIN items i USING(item_id)
                            WHERE o.recipe_id = recipes.recipe_id LIMIT 1)
WHERE recipe_id IN (
    SELECT o.recipe_id FROM recipe_outputs o WHERE o.item_id IN (
        'item_ee837e2daed9957715c3', 'item_45a08ea4b3f20f66cbae',
        'item_09dd41c61be9dbf82437', 'item_4e8420c10fd69bfc4451',
        'item_2ce91c1d348060d35dac', 'item_e421f303955f0febc6fe',
        'item_16cd7482ecdd9ef4213d', 'item_010f8e54ccd4c3d0a3b6',
        'item_b8c44c37e3d3d724806f', 'item_a5f62af7a444e5a8770f',
        'item_17411ca4f734ba75a3f7', 'item_d1c57a0a9a154038897a',
        'item_ae53589ddcce1c2e9ab5', 'item_be70f9a9f07ef034f398'
    )
);
UPDATE recipes SET title = 'Эльфские ввинчивающиеся стрелы ×5'
WHERE recipe_id IN (SELECT recipe_id FROM recipe_outputs WHERE item_id = 'item_6d82db782aabe22ad36d');
PRAGMA user_version=13;
COMMIT;
