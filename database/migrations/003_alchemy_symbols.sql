BEGIN IMMEDIATE;

CREATE TABLE alchemy_group_symbols (
    item_id TEXT PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE,
    symbol_code TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
    svg_path TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    source_page INTEGER NOT NULL CHECK (source_page > 0)
);
INSERT INTO alchemy_group_symbols (item_id, symbol_code, color, svg_path, source_id, source_page)
SELECT item_id, 'cuprum', '#9b638f', 'M19 5 L6 16 L19 27', 'witcher_core_ru', 142 FROM items WHERE name = 'Купорос' AND item_type = 'ingredient';
INSERT INTO alchemy_group_symbols SELECT item_id, 'rebis', '#f2583d', 'M5 27 L27 5', 'witcher_core_ru', 142 FROM items WHERE name = 'Рубедо' AND item_type = 'ingredient';
INSERT INTO alchemy_group_symbols SELECT item_id, 'aether', '#92b8b6', 'M5 9 L16 25 L27 9', 'witcher_core_ru', 142 FROM items WHERE name = 'Эфир' AND item_type = 'ingredient';
INSERT INTO alchemy_group_symbols SELECT item_id, 'quebrit', '#e6c623', 'M3 16 L29 16', 'witcher_core_ru', 142 FROM items WHERE name = 'Квебрит' AND item_type = 'ingredient';
INSERT INTO alchemy_group_symbols SELECT item_id, 'hydragenum', '#7889bd', 'M6 6 L26 26 M26 6 L6 26', 'witcher_core_ru', 142 FROM items WHERE name = 'Гидраген' AND item_type = 'ingredient';
INSERT INTO alchemy_group_symbols SELECT item_id, 'vermilion', '#65a76b', 'M12 5 L25 16 L12 27', 'witcher_core_ru', 142 FROM items WHERE name = 'Киноварь' AND item_type = 'ingredient';
INSERT INTO alchemy_group_symbols SELECT item_id, 'sol', '#e8b933', 'M16 3 L16 29', 'witcher_core_ru', 142 FROM items WHERE name = 'Солнце' AND item_type = 'ingredient';
INSERT INTO alchemy_group_symbols SELECT item_id, 'aer', '#c7d94e', 'M5 5 L27 27', 'witcher_core_ru', 142 FROM items WHERE name = 'Аер' AND item_type = 'ingredient';
INSERT INTO alchemy_group_symbols SELECT item_id, 'fulgor', '#ad4650', 'M5 24 L16 6 L27 24', 'witcher_core_ru', 142 FROM items WHERE name = 'Фульгор' AND item_type = 'ingredient';

PRAGMA user_version = 3;
COMMIT;
