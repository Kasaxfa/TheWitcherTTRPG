"""Regression checks for persistent identities, ambiguous links and symbol counts."""

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build_catalog import (  # noqa: E402
    DATABASE_PATH, SITE_DATA_PATH, build_site_data, migrate_database,
    render_site_data, validate_catalog, validate_site_data,
)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.connection = sqlite3.connect(DATABASE_PATH)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")

    def tearDown(self):
        self.connection.close()

    def test_catalog_links_and_page_sources(self):
        migrate_database(self.connection)
        validate_catalog(self.connection)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM recipes").fetchone()[0], 147)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM recipe_ingredients").fetchone()[0], 714)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM ingredient_link_decisions").fetchone()[0], 54)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM item_field_sources").fetchone()[0], 831)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM items").fetchone()[0], 252)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM item_id_aliases").fetchone()[0], 4)
        self.assertEqual(self.connection.execute("""
            SELECT count(*) FROM items WHERE weight_kg IS NULL
        """).fetchone()[0], 9)

    def test_retired_ids_resolve_to_the_original_recipe_outputs(self):
        for old_id, name in (
            ("item_e83c05dce246bdf3fcbc", "Кожа драконида"),
            ("item_222b75985b534ec5a84ab1079ecc8af6", "Посох"),
            ("item_86d56d8800904885ada3aa1ee1a425bc", "Павеза"),
            ("item_78f51796f0f7489cabdd30b49ffb55e5", "Нильфгаардская павеза"),
        ):
            current = self.connection.execute("""
                SELECT i.item_id, i.name FROM item_id_aliases a
                JOIN items i ON i.item_id=a.current_item_id
                WHERE a.retired_item_id=?
            """, (old_id,)).fetchone()
            self.assertIsNotNone(current)
            self.assertEqual(current[1], name)
            self.assertTrue(self.connection.execute("""
                SELECT 1 FROM recipe_outputs WHERE item_id=? LIMIT 1
            """, (current[0],)).fetchone())

    def test_export_contains_full_catalog_and_all_id_links(self):
        data = build_site_data(self.connection)
        validate_site_data(self.connection, data)
        self.assertEqual(len(data["items"]), 252)
        self.assertEqual(len(data["recipes"]), 147)
        self.assertEqual(len(data["symbols"]), 9)
        self.assertEqual(len(data["itemIdAliases"]), 4)
        self.assertTrue(all(recipe["id"] and recipe["categoryId"] for recipe in data["recipes"]))
        self.assertTrue(all(
            link["itemId"] in {item["id"] for item in data["items"]}
            for recipe in data["recipes"]
            for link in recipe["ingredients"] + recipe["outputs"]
        ))
        exported = SITE_DATA_PATH.read_text(encoding="utf-8")
        self.assertEqual(exported, render_site_data(data))

    def test_renames_and_reordering_do_not_change_ids_or_details(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = sqlite3.connect(Path(directory) / "catalog.sqlite3")
            self.connection.backup(snapshot)
            snapshot.execute("PRAGMA foreign_keys = ON")
            before = snapshot.execute("""
                SELECT r.recipe_id, r.sort_order, o.item_id, i.weight_kg
                FROM recipes r JOIN recipe_outputs o ON o.recipe_id=r.recipe_id
                JOIN items i ON i.item_id=o.item_id WHERE r.sort_order=37
            """).fetchone()
            recipe_id, _, item_id, weight = before
            snapshot.execute("UPDATE recipes SET title='Переименованный чертёж', sort_order=0 WHERE recipe_id=?", (recipe_id,))
            snapshot.execute("UPDATE items SET name='Переименованный предмет' WHERE item_id=?", (item_id,))
            self.assertEqual(snapshot.execute("SELECT item_id,weight_kg FROM items WHERE name='Переименованный предмет'").fetchone(), (item_id,weight))
            self.assertEqual(snapshot.execute("SELECT recipe_id FROM recipes WHERE sort_order=0").fetchone()[0], recipe_id)
            with self.assertRaises(sqlite3.IntegrityError):
                snapshot.execute("UPDATE items SET item_id='unstable' WHERE item_id=?", (item_id,))
            snapshot.rollback()
            snapshot.close()

    def test_book_formulas_match_ordered_symbol_quantities(self):
        expected = {
            "Могила Адды": "Эфир Эфир Гидраген Киноварь",
            "Щелочной порошок": "Киноварь Квебрит",
            "Кровосвертывающий порошок": "Эфир Ребис",
            "Галлюциноген": "Купорос Ребис",
            "Невидимые чернила": "Квебрит Эфир",
            "Обеззараживающие травы": "Квебрит Киноварь",
            "Друг отравителя": "Киноварь Киноварь Купорос Аер",
            "Нюхательная соль": "Квебрит Ребис Аер Аер",
            "Обеззараживающая жидкость": "Квебрит Аер",
            "Дыхание суккуба": "Солнце Эфир Эфир Аер",
            "Слёзы жён": "Гидраген Эфир Эфир Купорос",
            "Кислотный раствор": "Эфир Квебрит Киноварь Купорос Купорос Купорос",
            "Алхимический клей": "Квебрит Гидраген Аер Аер Купорос",
            "Чёрный яд": "Квебрит Квебрит Эфир Эфир Ребис",
            "Хлороформ": "Квебрит Квебрит Киноварь Киноварь Эфир Купорос",
            "Быстрый огонь": "Квебрит Ребис Ребис Аер Купорос Киноварь",
            "Ярость Бредена": "Солнце Солнце Солнце Фульгор Фульгор Фульгор Аер Киноварь",
            "Фистех": "Ребис Ребис Ребис Гидраген Гидраген Купорос Купорос Киноварь",
            "Эликсир Пантаграна": "Киноварь Киноварь Эфир Эфир Аер Солнце Фульгор",
            "Ароматное зелье": "Квебрит Квебрит Эфир Купорос Купорос Киноварь Гидраген Гидраген",
            "Слёзы Тальгара": "Гидраген Гидраген Гидраген Эфир Эфир Киноварь Купорос Купорос",
            "Зерриканский огонь": "Солнце Солнце Ребис Ребис Ребис Фульгор Купорос",
        }
        self.assertEqual(len(expected), 22)
        for title, formula in expected.items():
            rows = self.connection.execute("""
                SELECT i.name, ri.quantity, s.item_id
                FROM recipes r JOIN recipe_ingredients ri ON ri.recipe_id=r.recipe_id
                JOIN items i ON i.item_id=ri.item_id
                JOIN alchemy_group_symbols s ON s.item_id=i.item_id
                WHERE r.title=? AND r.recipe_type='alchemy' ORDER BY ri.line_number
            """, (title,)).fetchall()
            self.assertTrue(rows, title)
            actual = [name for name, qty, _ in rows for _ in range(int(qty))]
            # Forms with one ingredient per symbol and repeated ingredients follow the printed ordering.
            self.assertEqual(actual, formula.split(), title)


if __name__ == "__main__":
    unittest.main()
