PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
    source_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    edition TEXT
);

CREATE TABLE IF NOT EXISTS recipe_types (
    recipe_type TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS item_types (
    item_type TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipe_categories (
    category_id TEXT PRIMARY KEY,
    recipe_type TEXT NOT NULL REFERENCES recipe_types(recipe_type),
    label TEXT NOT NULL,
    UNIQUE (recipe_type, label)
);

CREATE TABLE IF NOT EXISTS skill_tiers (
    tier_code TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL REFERENCES item_types(item_type),
    description TEXT,
    weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg >= 0),
    cost_crowns REAL CHECK (cost_crowns IS NULL OR cost_crowns >= 0),
    UNIQUE (item_type, name)
);

CREATE TABLE IF NOT EXISTS item_sources (
    item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    source_role TEXT NOT NULL CHECK (
        source_role IN ('recipe_output', 'recipe_ingredient', 'item_description')
    ),
    PRIMARY KEY (item_id, source_id, page_number, source_role)
);

CREATE TABLE IF NOT EXISTS ingredient_details (
    item_id TEXT PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE,
    habitat TEXT,
    rarity TEXT,
    acquisition_method TEXT,
    alchemy_group TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS alchemical_details (
    item_id TEXT PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE,
    effect TEXT,
    duration TEXT,
    toxicity REAL CHECK (toxicity IS NULL OR toxicity >= 0),
    application TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS attribute_definitions (
    attribute_code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    value_kind TEXT NOT NULL CHECK (value_kind IN ('text', 'number')),
    unit TEXT
);

CREATE TABLE IF NOT EXISTS item_attributes (
    item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    attribute_code TEXT NOT NULL REFERENCES attribute_definitions(attribute_code),
    ordinal INTEGER NOT NULL DEFAULT 1 CHECK (ordinal > 0),
    text_value TEXT,
    numeric_value REAL,
    source_id TEXT REFERENCES sources(source_id),
    source_page INTEGER CHECK (source_page IS NULL OR source_page > 0),
    PRIMARY KEY (item_id, attribute_code, ordinal),
    CHECK (
        (text_value IS NOT NULL AND numeric_value IS NULL) OR
        (text_value IS NULL AND numeric_value IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS item_effects (
    item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    effect_order INTEGER NOT NULL DEFAULT 1 CHECK (effect_order > 0),
    effect_text TEXT NOT NULL,
    duration TEXT,
    toxicity REAL CHECK (toxicity IS NULL OR toxicity >= 0),
    application TEXT,
    source_id TEXT REFERENCES sources(source_id),
    source_page INTEGER CHECK (source_page IS NULL OR source_page > 0),
    PRIMARY KEY (item_id, effect_order)
);

CREATE TABLE IF NOT EXISTS recipes (
    recipe_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    recipe_type TEXT NOT NULL REFERENCES recipe_types(recipe_type),
    category_id TEXT NOT NULL REFERENCES recipe_categories(category_id),
    tier_code TEXT REFERENCES skill_tiers(tier_code),
    craft_dc INTEGER CHECK (craft_dc IS NULL OR craft_dc >= 0),
    crafting_time TEXT,
    sort_order INTEGER NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipe_sources (
    recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    PRIMARY KEY (recipe_id, source_id, page_number)
);

CREATE TABLE IF NOT EXISTS recipe_outputs (
    recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(item_id),
    quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
    PRIMARY KEY (recipe_id, item_id)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    item_id TEXT NOT NULL REFERENCES items(item_id),
    quantity REAL NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (recipe_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_recipes_type_category ON recipes(recipe_type, category_id);
CREATE INDEX IF NOT EXISTS idx_recipe_sources_page ON recipe_sources(source_id, page_number);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_item ON recipe_ingredients(item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_outputs_item ON recipe_outputs(item_id);

PRAGMA user_version = 1;
