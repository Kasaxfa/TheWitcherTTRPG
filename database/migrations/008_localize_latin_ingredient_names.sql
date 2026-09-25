BEGIN IMMEDIATE;

-- The Russian source prints both names in Latin. Keep the printed names in
-- verified_items.json while displaying Russian names in the catalog.
UPDATE items SET name = 'Лошадиная известь'
WHERE item_id = 'item_047fda02ae7041f398379db95ef16133'
  AND name = 'Calcium equum';
UPDATE items SET name = 'Оптима матер'
WHERE item_id = 'item_524a9eabd5bf45d4ab85e3fbb88783ed'
  AND name = 'Optima mater';

PRAGMA user_version = 8;
COMMIT;
