BEGIN IMMEDIATE;
INSERT INTO item_types(item_type, label) VALUES('equipment', 'Снаряжение');
INSERT INTO attribute_definitions(attribute_code, label, value_kind, unit)
VALUES
    ('equipment_category', 'Категория снаряжения', 'text', NULL),
    ('capacity', 'Вместимость', 'text', NULL);
PRAGMA user_version=12;
COMMIT;
