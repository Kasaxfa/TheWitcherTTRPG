"""Regression checks for persistent identities, ambiguous links and symbol counts."""

import json
import re
import sqlite3
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build_catalog import (  # noqa: E402
    DATABASE_PATH, SITE_DATA_PATH, build_site_data, migrate_database,
    render_site_data, validate_catalog, validate_site_data,
)
from import_verified_items import import_facts  # noqa: E402


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.connection = sqlite3.connect(DATABASE_PATH)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        migrate_database(self.connection)
        import_facts(self.connection)

    def tearDown(self):
        self.connection.close()

    def test_catalog_links_and_page_sources(self):
        migrate_database(self.connection)
        validate_catalog(self.connection)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM recipes").fetchone()[0], 147)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM recipe_ingredients").fetchone()[0], 715)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM recipe_sources").fetchone()[0], 147)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM ingredient_link_decisions").fetchone()[0], 54)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM item_field_sources").fetchone()[0], 846)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM items").fetchone()[0], 256)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM item_attributes").fetchone()[0], 739)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM ingredient_details").fetchone()[0], 110)
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM item_id_aliases").fetchone()[0], 4)
        self.assertEqual(self.connection.execute("""
            SELECT count(*) FROM items WHERE weight_kg IS NULL
        """).fetchone()[0], 10)

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
        self.assertEqual(len(data["items"]), 256)
        self.assertEqual(len(data["recipes"]), 147)
        self.assertEqual(len(data["symbols"]), 9)
        self.assertEqual(len(data["itemIdAliases"]), 4)
        self.assertTrue(all(recipe["id"] and recipe["categoryId"] for recipe in data["recipes"]))
        self.assertTrue(all("sourcePages" not in recipe and "page" not in recipe for recipe in data["recipes"]))
        self.assertTrue(all(
            "sourcePage" not in item and "page" not in item
            and all("sourcePage" not in attribute for attribute in item["attributes"])
            and all("sourcePage" not in effect for effect in item["effects"])
            for item in data["items"]
        ))
        self.assertTrue(all(
            link["itemId"] in {item["id"] for item in data["items"]}
            for recipe in data["recipes"]
            for link in recipe["ingredients"] + recipe["outputs"]
        ))
        exported = SITE_DATA_PATH.read_text(encoding="utf-8")
        self.assertEqual(exported, render_site_data(data))
        damaged = deepcopy(data)
        recipe = next(recipe for recipe in damaged["recipes"] if recipe["ingredients"])
        recipe["ingredients"][0]["quantity"] += 1
        with self.assertRaises(sqlite3.DatabaseError):
            validate_site_data(self.connection, damaged)
        damaged = deepcopy(data)
        weapon = next(item for item in damaged["items"] if item["type"] == "weapon")
        weapon["attributes"][0]["value"] = "ошибочное значение"
        with self.assertRaises(sqlite3.DatabaseError):
            validate_site_data(self.connection, damaged)

    def test_recipe_component_rows_match_the_printed_corrections(self):
        expected = {
            ("recipe_22e44477c36db691d290", 6): ("item_168a2bcfd9fac25bc7b9", 1),
            ("recipe_6fb5a2965b68c35273f2", 4): ("item_803aeb9e60ba3d98cce6", 2),
            ("recipe_46dc4937bdc28fd6bbc0", 7): ("item_2bd4350dc3d6704f69ba", 4),
            ("recipe_ef79c76712df7d249c4b", 4): ("item_168a2bcfd9fac25bc7b9", 1),
            ("recipe_ec7fd8d4219aaf4d9805", 7): ("item_168a2bcfd9fac25bc7b9", 2),
            ("recipe_ec7fd8d4219aaf4d9805", 8): ("item_a27ffa903164ed2b379f", 7),
            ("recipe_336d7a6dcefb41125754", 2): ("item_79dd0bd6bd427d246d46", 4),
            ("recipe_336d7a6dcefb41125754", 3): ("item_7b34ef808e8ceb056383", 6),
            ("recipe_336d7a6dcefb41125754", 5): ("item_3b050052261f116f3d6b", 4),
            ("recipe_336d7a6dcefb41125754", 7): ("item_d1e0bda6bf59017a2b70", 4),
            ("recipe_4ea0890f82f99480622b", 5): ("item_3b050052261f116f3d6b", 5),
            ("recipe_bb3fbf1f580f7aeff5cb", 6): ("item_3b050052261f116f3d6b", 4),
            ("recipe_d9358589b9535eca01e2", 3): ("item_79dd0bd6bd427d246d46", 3),
            ("recipe_cf7c33275a761a967e62", 4): ("item_4a02870e3faf31239541", 1),
            ("recipe_cf7c33275a761a967e62", 9): ("item_803aeb9e60ba3d98cce6", 5),
            ("recipe_7aa9d6ad8f49a9652c2c", 7): ("item_79dd0bd6bd427d246d46", 3),
            ("recipe_03728749a2b3774aa088", 5): ("item_70c291fabb398e93eaa4", 1),
            ("recipe_2fe858abcc3310f48d7c", 8): ("item_c737c6a2a556a51cb011", 1),
            ("recipe_f5b5d9f2bf4ac89d7098", 5): ("item_168a2bcfd9fac25bc7b9", 5),
        }
        for (recipe_id, line), (item_id, quantity) in expected.items():
            actual = self.connection.execute("""
                SELECT item_id, quantity FROM recipe_ingredients
                WHERE recipe_id=? AND line_number=?
            """, (recipe_id, line)).fetchone()
            self.assertEqual(tuple(actual), (item_id, quantity), (recipe_id, line))
        glaive = self.connection.execute("""
            SELECT item_id, quantity FROM recipe_ingredients
            WHERE recipe_id='recipe_85d8d4fd596ffb305d57' AND line_number=3
        """).fetchone()
        self.assertEqual(tuple(glaive), ("item_b02e519f43dc0fdfb1f6", 1))
        meteorite_sword = self.connection.execute("""
            SELECT item_id FROM recipe_ingredients
            WHERE recipe_id='recipe_4d5d9d7cb2132701c1a3' AND line_number=2
        """).fetchone()
        self.assertEqual(meteorite_sword[0], "item_d2af6098f1038f868865")
        sources = [row[0] for row in self.connection.execute("""
            SELECT page_number FROM recipe_sources WHERE recipe_id='recipe_bb3fbf1f580f7aeff5cb'
        """).fetchall()]
        self.assertEqual(sources, [133])

    def test_source_names_keep_their_ids_and_printed_spelling(self):
        data = build_site_data(self.connection)
        by_id = {item["id"]: item["name"] for item in data["items"]}
        expected = {
            "item_047fda02ae7041f398379db95ef16133": "Calcium equum",
            "item_524a9eabd5bf45d4ab85e3fbb88783ed": "Optima mater",
        }
        verified = {
            item["item_id"]: item for item in json.loads(
                (ROOT / "database" / "verified_items.json").read_text(encoding="utf-8")
            )["items"]
        }
        for item_id, name in expected.items():
            self.assertEqual(by_id[item_id], name)
            self.assertEqual(verified[item_id]["name"], name)
            self.assertNotIn("original_name", verified[item_id])
        allowed_latin = set(expected.values())
        self.assertTrue(all(not re.search(r"[A-Za-z]", name) or name in allowed_latin for name in by_id.values()))
        self.assertTrue(all(
            not re.search(r"[A-Za-z]", part["name"]) or part["name"] in allowed_latin
            for recipe in data["recipes"]
            for part in recipe["ingredients"] + recipe["outputs"]
        ))

    def test_rulebook_catalog_corrections_and_recipe_prices(self):
        rows = {row["name"]: row for row in build_site_data(self.connection)["items"]}
        for item_id, name, location, availability, weight, price in (
            ("item_c5e6870520e8d266b84f3862c7620a82", "Стекло", "Покупается", "Редкое", 0.5, 5),
            ("item_29e4f6ade05b98792eff4a68cf71e866", "Серебро", "Горы и под землёй", "Уникальное", 1, 72),
            ("item_fa0bf758081fa296bdf66349523632d7", "Камень", "Повсеместно", "Повсеместное", 2, 4),
            ("item_43eae099757151447448c4b01ae78ba4", "Зерриканская смесь", "Горы или под землёй", "Редкое", 0.1, 30),
        ):
            item = next(item for item in rows.values() if item["id"] == item_id)
            self.assertEqual(item["name"], name)
            self.assertEqual(item["details"]["where_found"], location)
            self.assertEqual(item["details"]["availability"], availability)
            self.assertEqual((item["weightKg"], item["costCrowns"]), (weight, price))
        ghost = next(item for item in rows.values() if item["id"] == "item_04f5854aa0cd47109d5d8040acb38211")
        self.assertIsNone(ghost["weightKg"])
        remedies = self.connection.execute("SELECT name FROM items WHERE item_id='item_8784ebdce5d9f494be56'").fetchone()
        self.assertEqual(remedies[0], "Обезболивающие травы")
        self.assertEqual(self.connection.execute("""
            SELECT COUNT(*) FROM recipes WHERE price_crowns IS NOT NULL
        """).fetchone()[0], 147)
        self.assertEqual(self.connection.execute("""
            SELECT COUNT(*) FROM recipes WHERE recipe_type='alchemy' AND surcharge_crowns IS NULL
        """).fetchone()[0], 22)
        self.assertEqual(self.connection.execute("""
            SELECT COUNT(*) FROM recipes WHERE recipe_type!='alchemy' AND surcharge_crowns IS NOT NULL
        """).fetchone()[0], 125)
        apprentice = self.connection.execute("""
            SELECT COUNT(*) FROM recipes r JOIN recipe_sources s USING(recipe_id)
            WHERE s.page_number=132 AND r.tier_code='apprentice'
        """).fetchone()[0]
        self.assertEqual(apprentice, 14)
        self.assertEqual(self.connection.execute("""
            SELECT tier_code FROM recipes WHERE recipe_id='recipe_03728749a2b3774aa088'
        """).fetchone()[0], "master")

    def test_weapon_cards_export_damage_types_and_concealment(self):
        data = build_site_data(self.connection)
        weapons = [item for item in data["items"] if item["type"] == "weapon"]
        self.assertEqual(len(weapons), 60)
        for item in weapons:
            codes = {attribute["code"] for attribute in item["attributes"]}
            self.assertIn("damage_type", codes, item["name"])
            self.assertIn("concealment", codes, item["name"])
        by_name = {item["name"]: {attribute["code"]: attribute["value"] for attribute in item["attributes"]} for item in weapons}
        self.assertEqual(by_name["Кинжал"]["concealment"], "Небольшое (под курткой)")
        self.assertEqual(by_name["Стилет"]["concealment"], "Маленькое (в кармане)")
        self.assertEqual(by_name["Эльфская глефа"]["damage_type"], "рубящий, колющий, дробящий")

    def test_armor_cards_include_source_effects_and_coverage(self):
        items = {item["id"]: item for item in build_site_data(self.connection)["items"]}
        pavise = items["item_5f91a8ddc7abffa50de9"]
        self.assertIn("без опоры", pavise["effects"][0]["text"])
        self.assertIn("больше половины надёжности", pavise["effects"][0]["text"])
        coverage = {
            attribute["code"]: attribute["value"]
            for attribute in items["item_646b2ab506d4f535a895"]["attributes"]
        }
        self.assertEqual(coverage["armor_region"], "Голова, туловище, руки и ноги")
        upgrades = {item["name"]: item["effects"] for item in items.values() if item["name"] in {
            "Кольчужное", "Краснолюдское", "Эльфское", "Укреплённая кожа", "Стальное", "Клёпаная кожа"
        }}
        self.assertIn("Сопротивление дробящему и режущему урону.", [e["text"] for e in upgrades["Кольчужное"]])
        self.assertIn("Сопротивление режущему и колющему урону.", [e["text"] for e in upgrades["Стальное"]])

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
            "Обезболивающие травы": "Квебрит Киноварь",
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
