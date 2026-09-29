BEGIN IMMEDIATE;
-- Стр. 74: масса стандартных боеприпасов 0,5 кг указана за 10 стрел.
-- В каталоге и инвентаре масса хранится за одну стрелу.
UPDATE items SET weight_kg = 0.05
WHERE item_id = 'item_86693cb17438240ec6a0';

PRAGMA user_version = 15;
COMMIT;
