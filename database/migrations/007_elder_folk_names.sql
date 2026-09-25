BEGIN IMMEDIATE;

-- The headings on pp. 136 and 138 say "Низушечий"; the armor on p. 138
-- is dragoon armor ("Драгунская"), not dragon armor.
UPDATE items SET name=replace(name, 'Низушский', 'Низушечий')
WHERE name LIKE 'Низушский%';
UPDATE recipes SET title=replace(title, 'Низушский', 'Низушечий')
WHERE title LIKE 'Низушский%';
UPDATE items SET name='Драгунская броня гномьей работы'
WHERE name='Драконья броня гномьей работы' AND item_type='armor';
UPDATE recipes SET title='Драгунская броня гномьей работы'
WHERE title='Драконья броня гномьей работы' AND recipe_type='armor';

PRAGMA user_version = 7;
COMMIT;
