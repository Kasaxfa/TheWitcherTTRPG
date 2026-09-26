#!/usr/bin/env python3
"""Migrate and verify the committed SQLite catalog, then export static recipes."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = ROOT / "database"
DATABASE_PATH = DATABASE_DIR / "catalog.sqlite3"
MIGRATIONS_DIR = DATABASE_DIR / "migrations"
SITE_DATA_PATH = ROOT / "data.js"
SOURCE_ID = "witcher_core_ru"


def migrate_database(connection: sqlite3.Connection) -> None:
    """Apply ordered, atomic schema changes to the existing catalog only."""
    current = connection.execute("PRAGMA user_version").fetchone()[0]
    migrations = sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql"))
    if not migrations or current < 1:
        raise sqlite3.DatabaseError("Missing baseline database or migrations")
    latest = int(migrations[-1].name[:3])
    if current > latest:
        raise sqlite3.DatabaseError(f"Database version {current} is newer than code version {latest}")
    for path in migrations:
        version = int(path.name[:3])
        if version <= current:
            continue
        if version != current + 1:
            raise sqlite3.DatabaseError(f"Missing migration {current + 1}")
        try:
            connection.executescript(path.read_text(encoding="utf-8"))
        except Exception:
            if connection.in_transaction:
                connection.rollback()
            raise
        actual = connection.execute("PRAGMA user_version").fetchone()[0]
        if actual != version:
            raise sqlite3.DatabaseError(f"Migration {path.name} did not set user_version")
        current = version
        print(f"Applied migration {path.name}.")


def validate_catalog(connection: sqlite3.Connection) -> None:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise sqlite3.DatabaseError(f"SQLite integrity check failed: {integrity}")
    errors = connection.execute("PRAGMA foreign_key_check").fetchall()
    if errors:
        raise sqlite3.DatabaseError(f"Foreign key check failed: {errors}")
    conflicting_aliases = connection.execute("""
        SELECT a.retired_item_id FROM item_id_aliases a
        WHERE EXISTS (SELECT 1 FROM items i WHERE i.item_id=a.retired_item_id)
           OR EXISTS (SELECT 1 FROM item_id_aliases next
                      WHERE next.retired_item_id=a.current_item_id)
    """).fetchall()
    if conflicting_aliases:
        raise sqlite3.DatabaseError(f"Retired item ID is live or aliases form a chain: {conflicting_aliases[:5]}")
    ambiguous = connection.execute("""
        SELECT r.title, ri.line_number, i.name
        FROM recipe_ingredients ri
        JOIN recipes r ON r.recipe_id = ri.recipe_id
        JOIN items i ON i.item_id = ri.item_id
        LEFT JOIN ingredient_link_decisions d
            ON d.recipe_id = ri.recipe_id AND d.line_number = ri.line_number
        WHERE (SELECT COUNT(*) FROM items candidate WHERE candidate.name = i.name) > 1
          AND (d.item_id IS NULL OR d.item_id != ri.item_id)
    """).fetchall()
    if ambiguous:
        raise sqlite3.DatabaseError(f"Ambiguous ingredient links need explicit decisions: {ambiguous[:5]}")
    dangling = connection.execute("""
        SELECT d.recipe_id, d.line_number FROM ingredient_link_decisions d
        JOIN recipe_ingredients ri
            ON ri.recipe_id = d.recipe_id AND ri.line_number = d.line_number
        WHERE d.item_id != ri.item_id
    """).fetchall()
    if dangling:
        raise sqlite3.DatabaseError(f"Ingredient link decisions disagree with recipe lines: {dangling[:5]}")
    missing = connection.execute("""
        SELECT r.recipe_id FROM recipes r
        WHERE NOT EXISTS (SELECT 1 FROM recipe_outputs o WHERE o.recipe_id = r.recipe_id)
           OR NOT EXISTS (SELECT 1 FROM recipe_sources s WHERE s.recipe_id = r.recipe_id)
    """).fetchall()
    if missing:
        raise sqlite3.DatabaseError(f"Recipes without outputs or source pages: {missing[:5]}")
    invalid_prices = connection.execute("""
        SELECT recipe_id FROM recipes
        WHERE price_crowns IS NULL
           OR (recipe_type = 'alchemy' AND surcharge_crowns IS NOT NULL)
           OR (recipe_type != 'alchemy' AND surcharge_crowns IS NULL)
    """).fetchall()
    if invalid_prices:
        raise sqlite3.DatabaseError(f"Recipes with missing or inconsistent prices: {invalid_prices[:5]}")
    for table, fields in {
        "items": ("weight_kg", "cost_crowns", "description"),
        "ingredient_details": ("where_found", "availability", "acquisition_method", "alchemy_group", "notes"),
        "alchemical_details": ("effect", "duration", "toxicity", "application", "notes"),
    }.items():
        for field in fields:
            unsourced = connection.execute(f"""
                SELECT item_id FROM {table} v WHERE v.{field} IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM item_field_sources s
                                  WHERE s.item_id = v.item_id AND s.field_name = ?)
            """, (field,)).fetchall()
            if unsourced:
                raise sqlite3.DatabaseError(f"Unsourced {table}.{field}: {unsourced[:5]}")
    for table in ("item_attributes", "item_effects"):
        unsourced = connection.execute(f"""
            SELECT item_id FROM {table} WHERE source_id IS NULL OR source_page IS NULL
        """).fetchall()
        if unsourced:
            raise sqlite3.DatabaseError(f"Unsourced {table}: {unsourced[:5]}")
    group_count = connection.execute("SELECT COUNT(*) FROM alchemy_group_symbols").fetchone()[0]
    if group_count != 9:
        raise sqlite3.DatabaseError(f"Expected nine source-backed alchemy symbols; found {group_count}")
    bad_symbol = connection.execute("""
        SELECT s.item_id FROM alchemy_group_symbols s JOIN items i ON i.item_id=s.item_id
        WHERE i.item_type != 'ingredient'
    """).fetchall()
    if bad_symbol:
        raise sqlite3.DatabaseError(f"Alchemy symbols must refer to ingredients: {bad_symbol}")


def build_site_data(connection: sqlite3.Connection) -> dict[str, Any]:
    query = """
        SELECT r.recipe_id, r.title, r.recipe_type, r.category_id,
               c.label AS category, t.tier_code, t.label AS tier,
               r.craft_dc, r.crafting_time, r.price_crowns, r.surcharge_crowns
        FROM recipes r
        JOIN recipe_categories c ON c.category_id = r.category_id
        LEFT JOIN skill_tiers t ON t.tier_code = r.tier_code
        ORDER BY r.sort_order
    """
    result: list[dict[str, Any]] = []
    for recipe in connection.execute(query):
        ingredients = [
            {"name": ingredient["name"], "quantity": ingredient["quantity"], "itemId": ingredient["item_id"]}
            for ingredient in connection.execute(
                """SELECT i.item_id, i.name, ri.quantity
                   FROM recipe_ingredients ri
                   JOIN items i ON i.item_id = ri.item_id
                   WHERE ri.recipe_id = ?
                   ORDER BY ri.line_number""",
                (recipe["recipe_id"],),
            )
        ]
        outputs = [
            {"itemId": output["item_id"], "name": output["name"], "quantity": output["quantity"]}
            for output in connection.execute(
                """SELECT o.item_id, i.name, o.quantity
                   FROM recipe_outputs o JOIN items i ON i.item_id=o.item_id
                   WHERE o.recipe_id=? ORDER BY o.item_id""",
                (recipe["recipe_id"],),
            )
        ]
        result.append(
            {
                "id": recipe["recipe_id"],
                "type": recipe["recipe_type"],
                "categoryId": recipe["category_id"],
                "category": recipe["category"],
                "tierCode": recipe["tier_code"],
                "tier": recipe["tier"],
                "name": recipe["title"],
                "dc": str(recipe["craft_dc"]) if recipe["craft_dc"] is not None else "",
                "time": recipe["crafting_time"] or "",
                "priceCrowns": recipe["price_crowns"],
                "surchargeCrowns": recipe["surcharge_crowns"],
                "ingredients": ingredients,
                "outputs": outputs,
            }
        )

    symbols = {
        row["item_id"]: {"name": row["name"], "code": row["symbol_code"], "color": row["color"], "path": row["svg_path"]}
        for row in connection.execute("""
            SELECT s.item_id, i.name, s.symbol_code, s.color, s.svg_path
            FROM alchemy_group_symbols s JOIN items i ON i.item_id=s.item_id
            ORDER BY s.symbol_code
        """)
    }
    items: list[dict[str, Any]] = []
    item_query = """
        SELECT i.item_id, i.name, i.item_type, ty.label AS type_label,
               i.description, i.weight_kg, i.cost_crowns
        FROM items i JOIN item_types ty ON ty.item_type=i.item_type
        ORDER BY ty.item_type, i.name COLLATE NOCASE, i.item_id
    """
    for item in connection.execute(item_query):
        details: dict[str, Any] = {}
        table_by_type = {
            "ingredient": ("ingredient_details", ("where_found", "availability", "acquisition_method", "alchemy_group", "notes")),
            "alchemical": ("alchemical_details", ("effect", "duration", "toxicity", "application", "notes")),
        }
        if item["item_type"] in table_by_type:
            table, fields = table_by_type[item["item_type"]]
            row = connection.execute(f"SELECT {', '.join(fields)} FROM {table} WHERE item_id=?", (item["item_id"],)).fetchone()
            if row:
                details = {field: row[field] for field in fields if row[field] is not None}
        attributes = [
            {"code": row["attribute_code"], "label": row["label"],
             "value": row["text_value"] if row["text_value"] is not None else row["numeric_value"],
             "unit": row["unit"], "ordinal": row["ordinal"]}
            for row in connection.execute("""
                SELECT a.attribute_code, d.label, d.unit, a.text_value,
                       a.numeric_value, a.ordinal
                FROM item_attributes a JOIN attribute_definitions d USING(attribute_code)
                WHERE a.item_id=? ORDER BY d.label, a.ordinal
            """, (item["item_id"],))
        ]
        effects = [
            {"order": row["effect_order"], "text": row["effect_text"],
             "duration": row["duration"], "toxicity": row["toxicity"],
             "application": row["application"]}
            for row in connection.execute("""
                SELECT effect_order, effect_text, duration, toxicity, application
                FROM item_effects WHERE item_id=? ORDER BY effect_order
            """, (item["item_id"],))
        ]
        items.append({
            "id": item["item_id"], "name": item["name"], "type": item["item_type"],
            "typeLabel": item["type_label"], "description": item["description"],
            "weightKg": item["weight_kg"], "costCrowns": item["cost_crowns"],
            "details": details, "attributes": attributes, "effects": effects,
            "symbol": symbols.get(item["item_id"]),
        })
    aliases = {
        row["retired_item_id"]: row["current_item_id"]
        for row in connection.execute("SELECT retired_item_id,current_item_id FROM item_id_aliases ORDER BY retired_item_id")
    }
    return {"recipes": result, "items": items, "symbols": symbols, "itemIdAliases": aliases}


def render_site_data(data: dict[str, Any]) -> str:
    return "// Generated from database/catalog.sqlite3 by tools/build_catalog.py. Do not edit manually.\n" + "".join(
        f"window.{name} = {json.dumps(value, ensure_ascii=False, separators=(',', ':'))};\n"
        for name, value in (
            ("RECIPES", data["recipes"]), ("ITEMS", data["items"]),
            ("ALCHEMY_SYMBOLS", data["symbols"]), ("ITEM_ID_ALIASES", data["itemIdAliases"]),
        )
    )


def validate_site_data(connection: sqlite3.Connection, data: dict[str, Any]) -> None:
    item_ids = {item["id"] for item in data["items"]}
    recipe_ids = {recipe["id"] for recipe in data["recipes"]}
    if len(item_ids) != len(data["items"]):
        raise sqlite3.DatabaseError("Export contains duplicate item IDs")
    if len(recipe_ids) != len(data["recipes"]):
        raise sqlite3.DatabaseError("Export contains duplicate recipe IDs")
    for recipe in data["recipes"]:
        for link in recipe["ingredients"] + recipe["outputs"]:
            if link["itemId"] not in item_ids:
                raise sqlite3.DatabaseError(f"Recipe {recipe['id']} has an exported link to a missing item")
    database_recipes = {
        row["recipe_id"]: row for row in connection.execute("""
            SELECT r.recipe_id, r.title, r.recipe_type, r.category_id, c.label AS category,
                   r.tier_code, t.label AS tier, r.craft_dc, r.crafting_time,
                   r.price_crowns, r.surcharge_crowns
            FROM recipes r JOIN recipe_categories c USING(category_id)
            LEFT JOIN skill_tiers t USING(tier_code)
        """)
    }
    exported_recipes = {recipe["id"]: recipe for recipe in data["recipes"]}
    if set(exported_recipes) != set(database_recipes):
        raise sqlite3.DatabaseError("Exported recipe IDs do not match the database")
    for recipe_id, row in database_recipes.items():
        recipe = exported_recipes[recipe_id]
        expected = {
            "name": row["title"], "type": row["recipe_type"],
            "categoryId": row["category_id"], "category": row["category"],
            "tierCode": row["tier_code"], "tier": row["tier"],
            "dc": str(row["craft_dc"]) if row["craft_dc"] is not None else "",
            "time": row["crafting_time"] or "", "priceCrowns": row["price_crowns"],
            "surchargeCrowns": row["surcharge_crowns"],
        }
        if any(recipe[key] != value for key, value in expected.items()):
            raise sqlite3.DatabaseError(f"Exported recipe fields do not match the database: {recipe_id}")
        expected_ingredients = [
            {"name": link["name"], "quantity": link["quantity"], "itemId": link["item_id"]}
            for link in connection.execute("""
                SELECT i.name, ri.quantity, ri.item_id
                FROM recipe_ingredients ri JOIN items i USING(item_id)
                WHERE ri.recipe_id=? ORDER BY ri.line_number
            """, (recipe_id,))
        ]
        expected_outputs = [
            {"itemId": link["item_id"], "name": link["name"], "quantity": link["quantity"]}
            for link in connection.execute("""
                SELECT o.item_id, i.name, o.quantity
                FROM recipe_outputs o JOIN items i USING(item_id)
                WHERE o.recipe_id=? ORDER BY o.item_id
            """, (recipe_id,))
        ]
        if recipe["ingredients"] != expected_ingredients or recipe["outputs"] != expected_outputs:
            raise sqlite3.DatabaseError(f"Exported recipe links do not match the database: {recipe_id}")
    database_items = {
        row["item_id"]: row for row in connection.execute("""
            SELECT i.item_id, i.name, i.item_type, ty.label AS type_label,
                   i.description, i.weight_kg, i.cost_crowns
            FROM items i JOIN item_types ty USING(item_type)
        """)
    }
    exported_items = {item["id"]: item for item in data["items"]}
    if set(exported_items) != set(database_items):
        raise sqlite3.DatabaseError("Exported item IDs do not match the database")
    detail_tables = {
        "ingredient": ("ingredient_details", ("where_found", "availability", "acquisition_method", "alchemy_group", "notes")),
        "alchemical": ("alchemical_details", ("effect", "duration", "toxicity", "application", "notes")),
    }
    for item_id, row in database_items.items():
        item = exported_items[item_id]
        expected = {
            "name": row["name"], "type": row["item_type"], "typeLabel": row["type_label"],
            "description": row["description"], "weightKg": row["weight_kg"],
            "costCrowns": row["cost_crowns"],
        }
        if any(item[key] != value for key, value in expected.items()):
            raise sqlite3.DatabaseError(f"Exported item fields do not match the database: {item_id}")
        details = {}
        if row["item_type"] in detail_tables:
            table, fields = detail_tables[row["item_type"]]
            stored = connection.execute(
                f"SELECT {', '.join(fields)} FROM {table} WHERE item_id=?", (item_id,)
            ).fetchone()
            if stored:
                details = {field: stored[field] for field in fields if stored[field] is not None}
        if item["details"] != details:
            raise sqlite3.DatabaseError(f"Exported item details do not match the database: {item_id}")
        attributes = [
            {"code": attribute["attribute_code"], "label": attribute["label"],
             "value": attribute["text_value"] if attribute["text_value"] is not None else attribute["numeric_value"],
             "unit": attribute["unit"], "ordinal": attribute["ordinal"]}
            for attribute in connection.execute("""
                SELECT a.attribute_code, d.label, d.unit, a.text_value, a.numeric_value, a.ordinal
                FROM item_attributes a JOIN attribute_definitions d USING(attribute_code)
                WHERE a.item_id=? ORDER BY d.label, a.ordinal
            """, (item_id,))
        ]
        effects = [
            {"order": effect["effect_order"], "text": effect["effect_text"],
             "duration": effect["duration"], "toxicity": effect["toxicity"],
             "application": effect["application"]}
            for effect in connection.execute("""
                SELECT effect_order, effect_text, duration, toxicity, application
                FROM item_effects WHERE item_id=? ORDER BY effect_order
            """, (item_id,))
        ]
        if item["attributes"] != attributes or item["effects"] != effects:
            raise sqlite3.DatabaseError(f"Exported item properties do not match the database: {item_id}")
    for old_id, current_id in data["itemIdAliases"].items():
        if old_id in item_ids or current_id not in item_ids:
            raise sqlite3.DatabaseError(f"Invalid exported item ID alias: {old_id} -> {current_id}")
    expected_aliases = {
        row["retired_item_id"]: row["current_item_id"]
        for row in connection.execute("SELECT retired_item_id,current_item_id FROM item_id_aliases")
    }
    if data["itemIdAliases"] != expected_aliases:
        raise sqlite3.DatabaseError("Exported item ID aliases do not match the database")
    expected_symbols = {
        row["item_id"]: {"name": row["name"], "code": row["symbol_code"], "color": row["color"], "path": row["svg_path"]}
        for row in connection.execute("""
            SELECT s.item_id, i.name, s.symbol_code, s.color, s.svg_path
            FROM alchemy_group_symbols s JOIN items i USING(item_id)
        """)
    }
    if data["symbols"] != expected_symbols:
        raise sqlite3.DatabaseError("Exported alchemy symbols do not match the database")
    if any(item["symbol"] != expected_symbols.get(item_id) for item_id, item in exported_items.items()):
        raise sqlite3.DatabaseError("Exported item symbols do not match the database")
    counts = (len(data["items"]), len(data["recipes"]))
    expected = (
        connection.execute("SELECT COUNT(*) FROM items").fetchone()[0],
        connection.execute("SELECT COUNT(*) FROM recipes").fetchone()[0],
    )
    if counts != expected:
        raise sqlite3.DatabaseError(f"Export count mismatch: {counts}, expected {expected}")
    exported_counts = {
        "recipe_ingredients": sum(len(recipe["ingredients"]) for recipe in data["recipes"]),
        "recipe_outputs": sum(len(recipe["outputs"]) for recipe in data["recipes"]),
        "item_attributes": sum(len(item["attributes"]) for item in data["items"]),
        "item_effects": sum(len(item["effects"]) for item in data["items"]),
        "alchemy_group_symbols": len(data["symbols"]),
        "item_id_aliases": len(data["itemIdAliases"]),
    }
    for table, exported_count in exported_counts.items():
        database_count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if exported_count != database_count:
            raise sqlite3.DatabaseError(
                f"Export count mismatch for {table}: {exported_count}, expected {database_count}"
            )
    detail_fields = {
        "ingredient_details": ("where_found", "availability", "acquisition_method", "alchemy_group", "notes"),
        "alchemical_details": ("effect", "duration", "toxicity", "application", "notes"),
    }
    for table, fields in detail_fields.items():
        database_count = sum(
            connection.execute(f"SELECT COUNT({field}) FROM {table}").fetchone()[0]
            for field in fields
        )
        exported_count = sum(
            sum(field in item["details"] for field in fields)
            for item in data["items"]
        )
        if exported_count != database_count:
            raise sqlite3.DatabaseError(
                f"Exported {table} details mismatch: {exported_count}, expected {database_count}"
            )


def export_site_data(connection: sqlite3.Connection) -> int:
    data = build_site_data(connection)
    validate_site_data(connection, data)
    SITE_DATA_PATH.write_text(render_site_data(data), encoding="utf-8")
    return len(data["recipes"])


def report_database(connection: sqlite3.Connection, recipe_count: int) -> None:
    item_count = connection.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    ingredient_count = connection.execute(
        "SELECT COUNT(*) FROM items WHERE item_type = 'ingredient'"
    ).fetchone()[0]
    ingredient_line_count = connection.execute(
        "SELECT COUNT(*) FROM recipe_ingredients"
    ).fetchone()[0]
    print(
        f"Database ready: {recipe_count} recipes, {item_count} items "
        f"({ingredient_count} raw ingredients), {ingredient_line_count} ingredient lines."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="check SQLite integrity and foreign keys without exporting site data",
    )
    args = parser.parse_args()

    if not DATABASE_PATH.exists():
        print(f"Database not found: restore {DATABASE_PATH} from Git; legacy seed is incomplete.", file=sys.stderr)
        return 1

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        migrate_database(connection)
        validate_catalog(connection)
        recipe_count = connection.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        if args.check:
            expected_data = build_site_data(connection)
            validate_site_data(connection, expected_data)
            if not SITE_DATA_PATH.exists() or SITE_DATA_PATH.read_text(encoding="utf-8") != render_site_data(expected_data):
                raise sqlite3.DatabaseError("data.js does not match the current database export; run tools/build_catalog.py")
            report_database(connection, recipe_count)
            print("SQLite integrity, sources, links and generated site data checked.")
            return 0
        exported_count = export_site_data(connection)
        if exported_count != recipe_count:
            raise sqlite3.DatabaseError(
                f"Export count mismatch: {exported_count} recipes exported, {recipe_count} in database."
            )
        report_database(connection, exported_count)
        print(f"Exported site data to {SITE_DATA_PATH.relative_to(ROOT)}.")
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
