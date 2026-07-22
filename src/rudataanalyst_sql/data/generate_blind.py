import sqlite3
import os
from pathlib import Path
import json

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DB_DIR = PROJECT_ROOT / "data" / "databases"
DB_DIR.mkdir(parents=True, exist_ok=True)

def setup_warehouse():
    conn = sqlite3.connect(DB_DIR / "warehouse.sqlite")
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL
    );
    CREATE TABLE inventory (
        product_id INTEGER,
        warehouse_id INTEGER,
        quantity INTEGER,
        last_updated DATE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    );
    INSERT INTO products VALUES (1, 'Laptop', 'Electronics', 1000.0);
    INSERT INTO products VALUES (2, 'Mouse', 'Electronics', 20.0);
    INSERT INTO products VALUES (3, 'Desk', 'Furniture', 200.0);
    INSERT INTO products VALUES (4, 'Chair', 'Furniture', 100.0);
    INSERT INTO inventory VALUES (1, 1, 50, '2026-07-20');
    INSERT INTO inventory VALUES (2, 1, 0, '2026-07-21');
    INSERT INTO inventory VALUES (3, 2, 10, '2026-06-15');
    INSERT INTO inventory VALUES (4, 1, 5, '2026-07-10');
    """)
    conn.commit()
    conn.close()
    return """CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL
);
CREATE TABLE inventory (
    product_id INTEGER,
    warehouse_id INTEGER,
    quantity INTEGER,
    last_updated DATE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);"""

def setup_subscriptions():
    conn = sqlite3.connect(DB_DIR / "subscriptions.sqlite")
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT
    );
    CREATE TABLE plans (
        id INTEGER PRIMARY KEY,
        plan_name TEXT,
        monthly_fee REAL
    );
    CREATE TABLE subscriptions (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER,
        plan_id INTEGER,
        start_date DATE,
        end_date DATE,
        status TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    INSERT INTO customers VALUES (1, 'Alice', 'alice@e.com');
    INSERT INTO customers VALUES (2, 'Bob', 'bob@e.com');
    INSERT INTO customers VALUES (3, 'Charlie', 'c@e.com');
    INSERT INTO plans VALUES (1, 'Basic', 9.99);
    INSERT INTO plans VALUES (2, 'Pro', 19.99);
    INSERT INTO subscriptions VALUES (1, 1, 2, '2026-01-01', '2026-12-31', 'active');
    INSERT INTO subscriptions VALUES (2, 2, 1, '2025-05-01', '2025-05-31', 'cancelled');
    INSERT INTO subscriptions VALUES (3, 3, 2, '2026-06-01', NULL, 'active');
    """)
    conn.commit()
    conn.close()
    return """CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT
);
CREATE TABLE plans (
    id INTEGER PRIMARY KEY,
    plan_name TEXT,
    monthly_fee REAL
);
CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    plan_id INTEGER,
    start_date DATE,
    end_date DATE,
    status TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);"""

def setup_logistics():
    conn = sqlite3.connect(DB_DIR / "logistics.sqlite")
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE drivers (
        id INTEGER PRIMARY KEY,
        name TEXT,
        rating REAL
    );
    CREATE TABLE vehicles (
        id INTEGER PRIMARY KEY,
        plate_number TEXT,
        capacity_kg REAL
    );
    CREATE TABLE shipments (
        id INTEGER PRIMARY KEY,
        driver_id INTEGER,
        vehicle_id INTEGER,
        weight_kg REAL,
        status TEXT,
        delivery_date DATE,
        FOREIGN KEY (driver_id) REFERENCES drivers(id),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );
    INSERT INTO drivers VALUES (1, 'Dave', 4.8);
    INSERT INTO drivers VALUES (2, 'Eve', 4.2);
    INSERT INTO vehicles VALUES (1, 'A123BC', 1500);
    INSERT INTO vehicles VALUES (2, 'X999YY', 5000);
    INSERT INTO shipments VALUES (1, 1, 1, 500, 'delivered', '2026-07-20');
    INSERT INTO shipments VALUES (2, 2, 2, 4500, 'in_transit', '2026-07-25');
    """)
    conn.commit()
    conn.close()
    return """CREATE TABLE drivers (
    id INTEGER PRIMARY KEY,
    name TEXT,
    rating REAL
);
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    plate_number TEXT,
    capacity_kg REAL
);
CREATE TABLE shipments (
    id INTEGER PRIMARY KEY,
    driver_id INTEGER,
    vehicle_id INTEGER,
    weight_kg REAL,
    status TEXT,
    delivery_date DATE,
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);"""

schemas = {
    "warehouse": setup_warehouse(),
    "subscriptions": setup_subscriptions(),
    "logistics": setup_logistics()
}

# Now generate 15 queries per domain
queries = []

# WAREHOUSE (15)
warehouse_q = [
    ("Покажи все товары в наличии на складе.", "SELECT p.name FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.quantity > 0;", "easy", ["join", "filter"]),
    ("Найди товары, которых нет в наличии ни на одном складе.", "SELECT name FROM products WHERE id NOT IN (SELECT product_id FROM inventory WHERE quantity > 0);", "medium", ["not_in", "subquery"]),
    ("Сколько всего товаров в категории Electronics сейчас на складах?", "SELECT SUM(i.quantity) FROM products p JOIN inventory i ON p.id = i.product_id WHERE p.category = 'Electronics';", "easy", ["join", "sum"]),
    ("Выведи названия товаров, у которых цена выше среднего по всем товарам.", "SELECT name FROM products WHERE price > (SELECT AVG(price) FROM products);", "medium", ["subquery", "avg"]),
    ("Покажи товары, запасы которых обновлялись в текущем месяце (июль 2026).", "SELECT p.name FROM products p JOIN inventory i ON p.id = i.product_id WHERE strftime('%Y-%m', i.last_updated) = '2026-07';", "medium", ["date", "join"]),
    ("Найди склад (warehouse_id) с самым большим общим количеством товаров.", "SELECT warehouse_id FROM inventory GROUP BY warehouse_id ORDER BY SUM(quantity) DESC LIMIT 1;", "medium", ["group_by", "order_by", "limit"]),
    ("Какой товар самый дорогой среди мебели (Furniture)?", "SELECT name FROM products WHERE category = 'Furniture' ORDER BY price DESC LIMIT 1;", "easy", ["filter", "order_by", "limit"]),
    ("Сколько дней назад обновлялись запасы каждого товара? Выведи id товара и количество дней от 2026-07-22.", "SELECT product_id, CAST(julianday('2026-07-22') - julianday(last_updated) AS INTEGER) FROM inventory;", "hard", ["date_math"]),
    ("Выведи категории товаров и общую стоимость запасов (цена * количество) по каждой категории.", "SELECT p.category, SUM(p.price * i.quantity) FROM products p JOIN inventory i ON p.id = i.product_id GROUP BY p.category;", "hard", ["join", "group_by", "math"]),
    ("У каких категорий товаров средняя цена выше 150?", "SELECT category FROM products GROUP BY category HAVING AVG(price) > 150;", "medium", ["group_by", "having"]),
    ("Сколько товаров в каждой категории имеют запасы меньше 10 штук?", "SELECT p.category, COUNT(p.id) FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.quantity < 10 GROUP BY p.category;", "medium", ["join", "group_by", "filter"]),
    ("Найди товары, запасы которых не обновлялись больше месяца (до 2026-06-22).", "SELECT p.name FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.last_updated < '2026-06-22';", "easy", ["join", "date_filter"]),
    ("Перечисли товары категории Electronics, которых нет на складе 1.", "SELECT p.name FROM products p LEFT JOIN inventory i ON p.id = i.product_id AND i.warehouse_id = 1 WHERE p.category = 'Electronics' AND (i.quantity IS NULL OR i.quantity = 0);", "hard", ["left_join", "null_check"]),
    ("Покажи 2 самых дешевых товара.", "SELECT name FROM products ORDER BY price ASC LIMIT 2;", "easy", ["order_by", "limit"]),
    ("Есть ли товары с одинаковой ценой? Выведи цену и количество таких товаров.", "SELECT price, COUNT(id) FROM products GROUP BY price HAVING COUNT(id) > 1;", "medium", ["group_by", "having"])
]

# SUBSCRIPTIONS (15)
subscriptions_q = [
    ("Сколько всего активных подписок?", "SELECT COUNT(id) FROM subscriptions WHERE status = 'active';", "easy", ["count", "filter"]),
    ("Выведи имена клиентов, у которых есть активная подписка на план Pro.", "SELECT c.name FROM customers c JOIN subscriptions s ON c.id = s.customer_id JOIN plans p ON s.plan_id = p.id WHERE s.status = 'active' AND p.plan_name = 'Pro';", "medium", ["join_multiple", "filter"]),
    ("Какие клиенты никогда не отменяли подписки?", "SELECT name FROM customers WHERE id NOT IN (SELECT customer_id FROM subscriptions WHERE status = 'cancelled');", "medium", ["not_in", "subquery"]),
    ("Какая общая ежемесячная выручка от активных подписок?", "SELECT SUM(p.monthly_fee) FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.status = 'active';", "easy", ["join", "sum"]),
    ("Выведи названия планов, на которые нет активных подписок.", "SELECT p.plan_name FROM plans p LEFT JOIN subscriptions s ON p.id = s.plan_id AND s.status = 'active' WHERE s.id IS NULL;", "hard", ["left_join", "null_check"]),
    ("Найди клиента с самой дорогой подпиской.", "SELECT c.name FROM customers c JOIN subscriptions s ON c.id = s.customer_id JOIN plans p ON s.plan_id = p.id ORDER BY p.monthly_fee DESC LIMIT 1;", "medium", ["join", "order_by", "limit"]),
    ("Сколько подписок началось в 2026 году?", "SELECT COUNT(id) FROM subscriptions WHERE strftime('%Y', start_date) = '2026';", "easy", ["date_format"]),
    ("У каких клиентов более одной подписки (включая отмененные)?", "SELECT c.name FROM customers c JOIN subscriptions s ON c.id = s.customer_id GROUP BY c.id HAVING COUNT(s.id) > 1;", "medium", ["group_by", "having"]),
    ("В каком месяце 2026 года началось больше всего подписок?", "SELECT strftime('%m', start_date) FROM subscriptions WHERE strftime('%Y', start_date) = '2026' GROUP BY strftime('%m', start_date) ORDER BY COUNT(id) DESC LIMIT 1;", "hard", ["date_format", "group_by", "order_by"]),
    ("Найди подписки, которые длились меньше 30 дней (для отмененных).", "SELECT id FROM subscriptions WHERE status = 'cancelled' AND CAST(julianday(end_date) - julianday(start_date) AS INTEGER) < 30;", "hard", ["date_math"]),
    ("Покажи email клиентов, чья подписка заканчивается в декабре 2026.", "SELECT c.email FROM customers c JOIN subscriptions s ON c.id = s.customer_id WHERE strftime('%Y-%m', s.end_date) = '2026-12';", "medium", ["join", "date_format"]),
    ("Какой план самый популярный (по количеству подписок)?", "SELECT p.plan_name FROM plans p JOIN subscriptions s ON p.id = s.plan_id GROUP BY p.id ORDER BY COUNT(s.id) DESC LIMIT 1;", "easy", ["join", "group_by", "order_by"]),
    ("Выведи клиентов без email адресов.", "SELECT name FROM customers WHERE email IS NULL;", "easy", ["null_check"]),
    ("Сколько клиентов имеют подписки на несколько разных планов?", "SELECT COUNT(customer_id) FROM (SELECT customer_id FROM subscriptions GROUP BY customer_id HAVING COUNT(DISTINCT plan_id) > 1);", "hard", ["subquery", "count_distinct"]),
    ("Покажи имена клиентов и названия их планов для активных подписок.", "SELECT c.name, p.plan_name FROM customers c JOIN subscriptions s ON c.id = s.customer_id JOIN plans p ON s.plan_id = p.id WHERE s.status = 'active';", "easy", ["join_multiple"])
]

# LOGISTICS (15)
logistics_q = [
    ("Выведи имена всех водителей с рейтингом выше 4.5.", "SELECT name FROM drivers WHERE rating > 4.5;", "easy", ["filter"]),
    ("Сколько доставок имеет статус in_transit?", "SELECT COUNT(id) FROM shipments WHERE status = 'in_transit';", "easy", ["count"]),
    ("Найди номер машины (plate_number), которая везет самый тяжелый груз сейчас.", "SELECT v.plate_number FROM vehicles v JOIN shipments s ON v.id = s.vehicle_id WHERE s.status = 'in_transit' ORDER BY s.weight_kg DESC LIMIT 1;", "medium", ["join", "order_by", "limit"]),
    ("Какие водители еще не сделали ни одной доставки (статус delivered)?", "SELECT name FROM drivers WHERE id NOT IN (SELECT driver_id FROM shipments WHERE status = 'delivered');", "medium", ["not_in", "subquery"]),
    ("Выведи средний вес груза для доставленных посылок.", "SELECT AVG(weight_kg) FROM shipments WHERE status = 'delivered';", "easy", ["avg"]),
    ("Какие машины перегружены (вес груза больше вместимости машины)?", "SELECT v.plate_number FROM vehicles v JOIN shipments s ON v.id = s.vehicle_id WHERE s.weight_kg > v.capacity_kg AND s.status = 'in_transit';", "hard", ["join", "compare_columns"]),
    ("У какого водителя больше всего активных доставок?", "SELECT d.name FROM drivers d JOIN shipments s ON d.id = s.driver_id WHERE s.status = 'in_transit' GROUP BY d.id ORDER BY COUNT(s.id) DESC LIMIT 1;", "medium", ["join", "group_by", "order_by"]),
    ("Покажи суммарный вес всех грузов, запланированных на 2026-07-25.", "SELECT SUM(weight_kg) FROM shipments WHERE delivery_date = '2026-07-25';", "easy", ["sum", "date_filter"]),
    ("Найди водителей, у которых рейтинг ниже среднего.", "SELECT name FROM drivers WHERE rating < (SELECT AVG(rating) FROM drivers);", "medium", ["subquery", "avg"]),
    ("Сколько доставок выполнила каждая машина (plate_number)?", "SELECT v.plate_number, COUNT(s.id) FROM vehicles v LEFT JOIN shipments s ON v.id = s.vehicle_id AND s.status = 'delivered' GROUP BY v.id;", "hard", ["left_join", "group_by"]),
    ("Есть ли машины без привязанных доставок?", "SELECT plate_number FROM vehicles WHERE id NOT IN (SELECT vehicle_id FROM shipments);", "medium", ["not_in", "subquery"]),
    ("Выведи список дат, когда ожидается более 1 доставки.", "SELECT delivery_date FROM shipments GROUP BY delivery_date HAVING COUNT(id) > 1;", "medium", ["group_by", "having"]),
    ("Какие водители доставили грузы тяжелее 1000 кг?", "SELECT DISTINCT d.name FROM drivers d JOIN shipments s ON d.id = s.driver_id WHERE s.status = 'delivered' AND s.weight_kg > 1000;", "medium", ["join", "distinct", "filter"]),
    ("Покажи 3 машины с самой большой вместимостью.", "SELECT plate_number FROM vehicles ORDER BY capacity_kg DESC LIMIT 3;", "easy", ["order_by", "limit"]),
    ("Сколько дней осталось до доставки груза с ID 2? Выведи количество дней от 2026-07-20.", "SELECT CAST(julianday(delivery_date) - julianday('2026-07-20') AS INTEGER) FROM shipments WHERE id = 2;", "hard", ["date_math"])
]

dataset = []
idx = 1
for d_id, q_list in [("warehouse", warehouse_q), ("subscriptions", subscriptions_q), ("logistics", logistics_q)]:
    schema_sql = schemas[d_id]
    for q, s, diff, concepts in q_list:
        dataset.append({
            "id": f"blind_{d_id}_{idx:03d}",
            "database_id": d_id,
            "schema_sql": schema_sql,
            "question_ru": q,
            "sql": s,
            "explanation_ru": "Сгенерировано вручную для слепого теста.",
            "difficulty": diff,
            "concepts": concepts,
            "template_family": "blind_manual",
            "split": "blind_benchmark"
        })
        idx += 1

out_path = PROJECT_ROOT / "data" / "blind_benchmark.jsonl"
with open(out_path, "w", encoding="utf-8") as f:
    for item in dataset:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")

print(f"Created {len(dataset)} queries in {out_path}")
