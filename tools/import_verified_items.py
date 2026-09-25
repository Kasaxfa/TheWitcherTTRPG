#!/usr/bin/env python3
"""Apply explicitly identified, book-sourced item facts without replacing catalog rows."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from build_catalog import DATABASE_PATH, SOURCE_ID, validate_catalog, migrate_database


DATA_PATH = Path(__file__).resolve().parents[1] / "database" / "verified_items.json"
DEFINITIONS = {
    "damage_type": ("Тип урона", "text", None),
    "accuracy": ("Точность", "text", None),
    "availability": ("Доступность", "text", None),
    "damage": ("Урон", "text", None),
    "reliability": ("Надёжность", "number", None),
    "hands": ("Хват", "number", None),
    "range": ("Дистанция", "text", None),
    "concealment": ("Скрытность", "text", None),
    "enhancement_slots": ("Усиления", "number", None),
    "armor_rating": ("Прочность брони", "number", None),
    "protection_bonus": ("Бонус к прочности брони", "number", None),
    "armor_slots": ("Усиления брони", "number", None),
    "encumbrance": ("Скованность движений", "number", None),
    "armor_region": ("Защищаемая часть тела", "text", None),
}
DETAIL_FIELDS = {
    "ingredient": ("habitat", "rarity", "acquisition_method", "alchemy_group", "notes"),
    "alchemical": ("effect", "duration", "toxicity", "application", "notes"),
}


def import_facts(connection: sqlite3.Connection) -> int:
    entries = json.loads(DATA_PATH.read_text(encoding="utf-8"))["items"]
    seen: set[str] = set()
    with connection:
        for code, (label, kind, unit) in DEFINITIONS.items():
            connection.execute("""INSERT OR IGNORE INTO attribute_definitions
                (attribute_code, label, value_kind, unit) VALUES (?, ?, ?, ?)""", (code, label, kind, unit))
        for entry in entries:
            item_id, page = entry["item_id"], entry["page"]
            if item_id in seen:
                raise ValueError(f"Duplicate item ID in verified data: {item_id}")
            seen.add(item_id)
            if type(page) is not int or page < 1:
                raise ValueError(f"Invalid source page for {item_id}")
            existing = connection.execute("SELECT name, item_type FROM items WHERE item_id = ?", (item_id,)).fetchone()
            if existing is None and entry.get("new") is True:
                connection.execute("INSERT INTO items (item_id, name, item_type) VALUES (?, ?, ?)",
                                   (item_id, entry["name"], entry["type"]))
                if entry["type"] == "ingredient":
                    connection.execute("INSERT INTO ingredient_details (item_id) VALUES (?)", (item_id,))
                if entry["type"] == "alchemical":
                    connection.execute("INSERT INTO alchemical_details (item_id) VALUES (?)", (item_id,))
                existing = (entry["name"], entry["type"])
            if existing is None or (existing[0], existing[1]) != (entry["name"], entry["type"]):
                raise ValueError(f"Wrong identity for {item_id}: {existing}")
            if entry["type"] not in ("weapon", "armor", "material", "ingredient", "alchemical"):
                raise ValueError(f"Unexpected item type: {entry['type']}")
            for field in ("weight_kg", "cost_crowns", "description"):
                if field not in entry:
                    continue
                value = entry[field]
                if value is None or (isinstance(value, (int, float)) and value < 0):
                    raise ValueError(f"Invalid {field}: {item_id}")
                connection.execute(f"UPDATE items SET {field} = ? WHERE item_id = ?", (value, item_id))
                connection.execute("""INSERT OR IGNORE INTO item_field_sources
                    (item_id, field_name, source_id, page_number) VALUES (?, ?, ?, ?)""",
                    (item_id, field, SOURCE_ID, page))
            for field in DETAIL_FIELDS.get(entry["type"], ()):
                if field not in entry:
                    continue
                value = entry[field]
                table = "ingredient_details" if entry["type"] == "ingredient" else "alchemical_details"
                if value is None:
                    raise ValueError(f"Explicit unknowns must be omitted: {item_id}, {field}")
                connection.execute(f"UPDATE {table} SET {field} = ? WHERE item_id = ?", (value, item_id))
                connection.execute("""INSERT OR IGNORE INTO item_field_sources
                    (item_id, field_name, source_id, page_number) VALUES (?, ?, ?, ?)""",
                    (item_id, field, SOURCE_ID, page))
            for code, value in entry.get("attributes", {}).items():
                if code not in DEFINITIONS:
                    raise ValueError(f"Undefined item attribute: {code}")
                kind = DEFINITIONS[code][1]
                if kind == "number" and not isinstance(value, (int, float)):
                    raise ValueError(f"Numeric attribute required: {code}")
                if kind == "text" and not isinstance(value, str):
                    raise ValueError(f"Text attribute required: {code}")
                text_value, numeric_value = (value, None) if kind == "text" else (None, value)
                connection.execute("""INSERT INTO item_attributes
                    (item_id, attribute_code, text_value, numeric_value, source_id, source_page)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(item_id, attribute_code, ordinal) DO UPDATE SET
                    text_value=excluded.text_value, numeric_value=excluded.numeric_value,
                    source_id=excluded.source_id, source_page=excluded.source_page""",
                    (item_id, code, text_value, numeric_value, SOURCE_ID, page))
            if "effects" in entry:
                connection.execute("DELETE FROM item_effects WHERE item_id = ?", (item_id,))
                for order, effect in enumerate(entry["effects"], 1):
                    connection.execute("""INSERT INTO item_effects
                        (item_id, effect_order, effect_text, source_id, source_page)
                        VALUES (?, ?, ?, ?, ?)""", (item_id, order, effect, SOURCE_ID, page))
            connection.execute("""INSERT OR IGNORE INTO item_sources
                (item_id, source_id, page_number, source_role)
                VALUES (?, ?, ?, 'item_description')""", (item_id, SOURCE_ID, page))
        validate_catalog(connection)
    return len(seen)


if __name__ == "__main__":
    with sqlite3.connect(DATABASE_PATH) as db:
        db.execute("PRAGMA foreign_keys = ON")
        migrate_database(db)
        print(f"Imported verified book facts for {import_facts(db)} items.")
