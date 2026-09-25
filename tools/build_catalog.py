#!/usr/bin/env python3
"""Initialize the catalog SQLite database and export its recipes for the static site."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = ROOT / "database"
DATABASE_PATH = DATABASE_DIR / "catalog.sqlite3"
SCHEMA_PATH = DATABASE_DIR / "schema.sql"
SEED_PATH = DATABASE_DIR / "seed_recipes.json"
SITE_DATA_PATH = ROOT / "data.js"
SOURCE_ID = "witcher_core_ru"
SOURCE_TITLE = "Основная книга правил НРИ «Ведьмак»"

RECIPE_TYPE_LABELS = {
    "alchemy": "Алхимия",
    "material": "Материалы",
    "weapon": "Оружие",
    "armor": "Броня",
}
ITEM_TYPE_LABELS = {
    "ingredient": "Ингредиент",
    "alchemical": "Алхимическое средство",
    "material": "Ремесленный материал",
    "weapon": "Оружие",
    "armor": "Броня",
}
OUTPUT_ITEM_TYPES = {
    "alchemy": "alchemical",
    "material": "material",
    "weapon": "weapon",
    "armor": "armor",
}
TIER_ORDER = {
    "Новичок": 1,
    "Подмастерье": 2,
    "Мастер": 3,
    "Великий мастер": 4,
}
TIER_CODES = {
    "Новичок": "novice",
    "Подмастерье": "apprentice",
    "Мастер": "master",
    "Великий мастер": "grandmaster",
}
ITEM_MATCH_PRIORITY = {
    "material": 0,
    "ingredient": 1,
    "alchemical": 2,
    "weapon": 3,
    "armor": 4,
}


def stable_id(prefix: str, *parts: str) -> str:
    key = "\x1f".join(parts)
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:20]
    return f"{prefix}_{digest}"


def split_output_quantity(title: str) -> tuple[str, int]:
    match = re.search(r"\s+×\s*(\d+)$", title)
    if not match:
        return title, 1
    return title[: match.start()].rstrip(), int(match.group(1))


def parse_page_numbers(value: Any) -> list[int]:
    pages = [int(number) for number in re.findall(r"\d+", str(value or ""))]
    if not pages:
        raise ValueError(f"Recipe source page is missing or invalid: {value!r}")
    return list(dict.fromkeys(pages))


def insert_reference_rows(connection: sqlite3.Connection, recipes: list[dict[str, Any]]) -> None:
    connection.execute(
        "INSERT INTO sources (source_id, title) VALUES (?, ?)",
        (SOURCE_ID, SOURCE_TITLE),
    )
    connection.executemany(
        "INSERT INTO recipe_types (recipe_type, label) VALUES (?, ?)",
        RECIPE_TYPE_LABELS.items(),
    )
    connection.executemany(
        "INSERT INTO item_types (item_type, label) VALUES (?, ?)",
        ITEM_TYPE_LABELS.items(),
    )

    tiers = sorted({str(recipe.get("tier", "")) for recipe in recipes if recipe.get("tier")})
    for tier in tiers:
        tier_code = TIER_CODES.get(tier, stable_id("tier", tier))
        connection.execute(
            "INSERT INTO skill_tiers (tier_code, label, sort_order) VALUES (?, ?, ?)",
            (tier_code, tier, TIER_ORDER.get(tier, 100)),
        )

    categories: dict[tuple[str, str], str] = {}
    for recipe in recipes:
        recipe_type = str(recipe["type"])
        if recipe_type not in RECIPE_TYPE_LABELS:
            raise ValueError(f"Unknown recipe type: {recipe_type}")
        category = str(recipe.get("category") or RECIPE_TYPE_LABELS[recipe_type])
        key = (recipe_type, category)
        if key not in categories:
            category_id = stable_id("cat", recipe_type, category)
            categories[key] = category_id
            connection.execute(
                "INSERT INTO recipe_categories (category_id, recipe_type, label) VALUES (?, ?, ?)",
                (category_id, recipe_type, category),
            )


def initialize_database(path: Path) -> None:
    if not SCHEMA_PATH.exists() or not SEED_PATH.exists():
        raise FileNotFoundError("Both database/schema.sql and database/seed_recipes.json are required.")

    recipes: list[dict[str, Any]] = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    if not isinstance(recipes, list):
        raise ValueError("The recipe seed must be a JSON array.")

    temporary_path = path.with_suffix(".tmp.sqlite3")
    temporary_path.unlink(missing_ok=True)
    connection = sqlite3.connect(temporary_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        insert_reference_rows(connection, recipes)

        output_items: dict[tuple[str, str], str] = {}
        items_by_name: dict[str, list[tuple[str, str]]] = {}
        recipe_output_items: list[tuple[str, int]] = []

        for recipe in recipes:
            recipe_type = str(recipe["type"])
            item_type = OUTPUT_ITEM_TYPES[recipe_type]
            item_name, output_quantity = split_output_quantity(str(recipe["name"]))
            item_key = (item_type, item_name)
            item_id = output_items.get(item_key)
            if item_id is None:
                item_id = stable_id("item", item_type, item_name)
                output_items[item_key] = item_id
                connection.execute(
                    "INSERT INTO items (item_id, name, item_type) VALUES (?, ?, ?)",
                    (item_id, item_name, item_type),
                )
                items_by_name.setdefault(item_name, []).append((item_id, item_type))
            recipe_output_items.append((item_id, output_quantity))

        for recipe in recipes:
            for ingredient in recipe.get("ingredients", []):
                name = str(ingredient["name"])
                if name in items_by_name:
                    continue
                item_id = stable_id("item", "ingredient", name)
                connection.execute(
                    "INSERT INTO items (item_id, name, item_type) VALUES (?, ?, 'ingredient')",
                    (item_id, name),
                )
                items_by_name.setdefault(name, []).append((item_id, "ingredient"))

        connection.execute(
            """INSERT INTO ingredient_details (item_id)
               SELECT item_id FROM items WHERE item_type = 'ingredient'"""
        )

        for order, recipe in enumerate(recipes, start=1):
            recipe_type = str(recipe["type"])
            category = str(recipe.get("category") or RECIPE_TYPE_LABELS[recipe_type])
            category_id = stable_id("cat", recipe_type, category)
            tier = str(recipe.get("tier") or "")
            tier_code = TIER_CODES.get(tier, stable_id("tier", tier)) if tier else None
            recipe_id = stable_id(
                "recipe",
                str(order),
                recipe_type,
                category,
                str(recipe["name"]),
                str(recipe.get("page", "")),
            )
            dc = recipe.get("dc")
            connection.execute(
                """INSERT INTO recipes
                   (recipe_id, title, recipe_type, category_id, tier_code, craft_dc,
                    crafting_time, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    recipe_id,
                    str(recipe["name"]),
                    recipe_type,
                    category_id,
                    tier_code,
                    int(dc) if dc not in (None, "") else None,
                    recipe.get("time"),
                    order,
                ),
            )
            source_pages = parse_page_numbers(recipe.get("page"))
            connection.executemany(
                """INSERT INTO recipe_sources (recipe_id, source_id, page_number)
                   VALUES (?, ?, ?)""",
                [(recipe_id, SOURCE_ID, page) for page in source_pages],
            )
            output_item_id, output_quantity = recipe_output_items[order - 1]
            connection.execute(
                "INSERT INTO recipe_outputs (recipe_id, item_id, quantity) VALUES (?, ?, ?)",
                (recipe_id, output_item_id, output_quantity),
            )
            connection.executemany(
                """INSERT OR IGNORE INTO item_sources
                   (item_id, source_id, page_number, source_role)
                   VALUES (?, ?, ?, 'recipe_output')""",
                [(output_item_id, SOURCE_ID, page) for page in source_pages],
            )

            for line_number, ingredient in enumerate(recipe.get("ingredients", []), start=1):
                name = str(ingredient["name"])
                candidates = items_by_name[name]
                item_id, _ = min(
                    candidates,
                    key=lambda candidate: (ITEM_MATCH_PRIORITY[candidate[1]], candidate[0]),
                )
                quantity = float(ingredient.get("quantity", 1))
                connection.execute(
                    """INSERT INTO recipe_ingredients
                       (recipe_id, line_number, item_id, quantity)
                       VALUES (?, ?, ?, ?)""",
                    (recipe_id, line_number, item_id, quantity),
                )
                connection.executemany(
                    """INSERT OR IGNORE INTO item_sources
                       (item_id, source_id, page_number, source_role)
                       VALUES (?, ?, ?, 'recipe_ingredient')""",
                    [(item_id, SOURCE_ID, page) for page in source_pages],
                )

        connection.execute(
            """INSERT INTO alchemical_details (item_id)
               SELECT item_id FROM items WHERE item_type = 'alchemical'"""
        )
        connection.commit()
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise sqlite3.DatabaseError(f"SQLite integrity check failed: {integrity}")
        foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise sqlite3.DatabaseError(f"Foreign key check failed: {foreign_key_errors}")
    finally:
        connection.close()

    os.replace(temporary_path, path)


def export_site_data(connection: sqlite3.Connection) -> int:
    query = """
        SELECT r.recipe_id, r.title, r.recipe_type, c.label AS category,
               t.label AS tier, r.craft_dc, r.crafting_time
        FROM recipes r
        JOIN recipe_categories c ON c.category_id = r.category_id
        LEFT JOIN skill_tiers t ON t.tier_code = r.tier_code
        ORDER BY r.sort_order
    """
    result: list[dict[str, Any]] = []
    for recipe in connection.execute(query):
        source_pages = [
            row["page_number"]
            for row in connection.execute(
                """SELECT page_number FROM recipe_sources
                   WHERE recipe_id = ? ORDER BY page_number""",
                (recipe["recipe_id"],),
            )
        ]
        ingredients = [
            {"name": ingredient["name"], "quantity": ingredient["quantity"]}
            for ingredient in connection.execute(
                """SELECT i.name, ri.quantity
                   FROM recipe_ingredients ri
                   JOIN items i ON i.item_id = ri.item_id
                   WHERE ri.recipe_id = ?
                   ORDER BY ri.line_number""",
                (recipe["recipe_id"],),
            )
        ]
        result.append(
            {
                "type": recipe["recipe_type"],
                "category": recipe["category"],
                "tier": recipe["tier"],
                "name": recipe["title"],
                "dc": str(recipe["craft_dc"]) if recipe["craft_dc"] is not None else "",
                "time": recipe["crafting_time"] or "",
                "ingredients": ingredients,
                "page": source_pages[0] if len(source_pages) == 1 else ", ".join(
                    str(page) for page in source_pages
                ),
            }
        )

    payload = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    SITE_DATA_PATH.write_text(
        "// Generated from database/catalog.sqlite3 by tools/build_catalog.py.\n"
        "window.RECIPES = "
        + payload
        + ";\n",
        encoding="utf-8",
    )
    return len(result)


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
        "--rebuild-db",
        action="store_true",
        help="recreate the SQLite file from schema.sql and the original seed snapshot",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="check SQLite integrity and foreign keys without exporting site data",
    )
    args = parser.parse_args()

    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    if args.rebuild_db or not DATABASE_PATH.exists():
        initialize_database(DATABASE_PATH)
    if not DATABASE_PATH.exists():
        print(f"Database not found: {DATABASE_PATH}", file=sys.stderr)
        return 1

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise sqlite3.DatabaseError(f"SQLite integrity check failed: {integrity}")
        foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise sqlite3.DatabaseError(f"Foreign key check failed: {foreign_key_errors}")
        recipe_count = connection.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        if args.check:
            report_database(connection, recipe_count)
            print("SQLite integrity and foreign key checks passed.")
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
