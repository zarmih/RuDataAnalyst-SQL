#!/usr/bin/env python3
"""
Idempotent seed dataset builder for Russian text-to-SQL portfolio project.

Creates 3 SQLite databases (shop, hr, support) with realistic schemas and
synthetic data, then generates 60+ training/validation/test examples in JSONL.

Split strategy:
  - train: shop + hr databases (mixed difficulties)
  - validation: shop + hr databases (held-out questions, no question overlap with train)
  - test: support database ONLY (entirely separate schema family for transfer measurement)
"""

import json
import os
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
DB_DIR = DATA_DIR / "databases"


# ──────────────────────────────────────────────
#  Database schemas and seed data
# ──────────────────────────────────────────────

DATABASES: dict[str, dict] = {
    "shop": {
        "schema": """
CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    city TEXT,
    registered_at TEXT NOT NULL
);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    price REAL NOT NULL CHECK(price > 0),
    in_stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('new','processing','shipped','delivered','cancelled'))
);

CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL
);
""",
        "seed_data": [
            "INSERT INTO categories VALUES (1,'Электроника'),(2,'Одежда'),(3,'Книги'),(4,'Продукты');",
            "INSERT INTO customers VALUES (1,'Иванов Алексей','ivanov@mail.ru','Москва','2024-01-15'),"
            "(2,'Петрова Мария','petrova@ya.ru','Санкт-Петербург','2024-02-20'),"
            "(3,'Сидоров Дмитрий','sidorov@gmail.com','Казань','2024-03-10'),"
            "(4,'Козлова Анна','kozlova@mail.ru','Москва','2024-06-01'),"
            "(5,'Новиков Павел','novikov@ya.ru','Екатеринбург','2025-01-05');",
            "INSERT INTO products VALUES (1,'Ноутбук',1,59990.0,10),(2,'Смартфон',1,29990.0,25),"
            "(3,'Футболка',2,1490.0,100),(4,'Джинсы',2,3990.0,50),"
            "(5,'Python. Справочник',3,890.0,30),(6,'SQL за 24 часа',3,750.0,15),"
            "(7,'Кофе молотый',4,450.0,200),(8,'Чай зелёный',4,320.0,150);",
            "INSERT INTO orders VALUES (1,1,'2025-01-10','delivered'),(2,1,'2025-02-15','delivered'),"
            "(3,2,'2025-01-20','shipped'),(4,3,'2025-03-01','cancelled'),"
            "(5,2,'2025-03-10','delivered'),(6,4,'2025-04-05','processing'),"
            "(7,5,'2025-04-10','new'),(8,1,'2025-05-01','delivered'),"
            "(9,3,'2025-05-15','delivered'),(10,2,'2025-06-01','new');",
            "INSERT INTO order_items VALUES (1,1,1,1,59990.0),(2,1,7,2,450.0),"
            "(3,2,3,3,1490.0),(4,2,5,1,890.0),(5,3,2,1,29990.0),"
            "(6,4,4,2,3990.0),(7,5,6,1,750.0),(8,5,8,3,320.0),"
            "(9,6,1,1,59990.0),(10,7,3,2,1490.0),(11,7,7,5,450.0),"
            "(12,8,2,1,29990.0),(13,8,5,2,890.0),(14,9,4,1,3990.0),"
            "(15,9,8,2,320.0),(16,10,1,1,59990.0);",
        ],
    },
    "hr": {
        "schema": """
CREATE TABLE departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    budget REAL
);

CREATE TABLE employees (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    position TEXT NOT NULL,
    salary REAL NOT NULL,
    hire_date TEXT NOT NULL,
    manager_id INTEGER REFERENCES employees(id)
);

CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL CHECK(status IN ('planning','active','completed','on_hold'))
);

CREATE TABLE project_assignments (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    role TEXT NOT NULL,
    hours_allocated INTEGER NOT NULL DEFAULT 0
);
""",
        "seed_data": [
            "INSERT INTO departments VALUES (1,'Разработка',5000000.0),(2,'Маркетинг',2000000.0),"
            "(3,'HR',1500000.0),(4,'Аналитика',3000000.0);",
            "INSERT INTO employees VALUES "
            "(1,'Алексей','Смирнов',1,'CTO',250000.0,'2020-03-01',NULL),"
            "(2,'Мария','Кузнецова',1,'Senior Developer',180000.0,'2021-06-15',1),"
            "(3,'Дмитрий','Попов',1,'Developer',120000.0,'2022-09-01',2),"
            "(4,'Елена','Волкова',2,'Marketing Lead',160000.0,'2021-01-10',NULL),"
            "(5,'Анна','Соколова',2,'Marketing Manager',110000.0,'2023-03-20',4),"
            "(6,'Игорь','Лебедев',4,'Lead Analyst',170000.0,'2020-11-01',NULL),"
            "(7,'Ольга','Новикова',4,'Analyst',130000.0,'2022-04-15',6),"
            "(8,'Павел','Морозов',3,'HR Manager',140000.0,'2021-08-01',NULL),"
            "(9,'Светлана','Петрова',1,'Junior Developer',80000.0,'2024-01-15',2),"
            "(10,'Андрей','Козлов',4,'Junior Analyst',90000.0,'2024-06-01',6);",
            "INSERT INTO projects VALUES "
            "(1,'Редизайн сайта',1,'2024-01-01','2024-06-30','completed'),"
            "(2,'CRM система',1,'2024-07-01',NULL,'active'),"
            "(3,'Маркетинг Q3',2,'2024-07-01','2024-09-30','completed'),"
            "(4,'BI дашборд',4,'2024-10-01',NULL,'active'),"
            "(5,'Подбор персонала 2025',3,'2025-01-01',NULL,'planning');",
            "INSERT INTO project_assignments VALUES "
            "(1,1,2,'Lead',500),(2,1,3,'Developer',400),(3,1,9,'Intern',200),"
            "(4,2,2,'Lead',300),(5,2,3,'Developer',600),(6,2,9,'Developer',400),"
            "(7,3,4,'Lead',200),(8,3,5,'Executor',350),"
            "(9,4,6,'Lead',400),(10,4,7,'Analyst',500),(11,4,10,'Junior',300),"
            "(12,5,8,'Lead',100);",
        ],
    },
    "support": {
        "schema": """
CREATE TABLE clients (
    id INTEGER PRIMARY KEY,
    company_name TEXT NOT NULL,
    plan TEXT NOT NULL CHECK(plan IN ('free','basic','premium','enterprise')),
    registered_at TEXT NOT NULL
);

CREATE TABLE agents (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    team TEXT NOT NULL CHECK(team IN ('L1','L2','L3')),
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE tickets (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    agent_id INTEGER REFERENCES agents(id),
    subject TEXT NOT NULL,
    priority TEXT NOT NULL CHECK(priority IN ('low','medium','high','critical')),
    status TEXT NOT NULL CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
    category TEXT NOT NULL CHECK(category IN ('bug','feature_request','question','incident')),
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    satisfaction_score INTEGER CHECK(satisfaction_score BETWEEN 1 AND 5)
);

CREATE TABLE ticket_messages (
    id INTEGER PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id),
    sender_type TEXT NOT NULL CHECK(sender_type IN ('client','agent','system')),
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);
""",
        "seed_data": [
            "INSERT INTO clients VALUES "
            "(1,'ООО Альфа','premium','2023-01-10'),"
            "(2,'ИП Бета','basic','2023-06-15'),"
            "(3,'АО Гамма','enterprise','2022-03-01'),"
            "(4,'ООО Дельта','free','2024-01-20'),"
            "(5,'ЗАО Эпсилон','premium','2023-09-05');",
            "INSERT INTO agents VALUES "
            "(1,'Кирилл Иванов','L1',1),(2,'Наталья Сидорова','L1',1),"
            "(3,'Артём Козлов','L2',1),(4,'Виктория Морозова','L2',1),"
            "(5,'Максим Петров','L3',1),(6,'Елена Волкова','L1',0);",
            "INSERT INTO tickets VALUES "
            "(1,1,1,'Ошибка в отчёте','high','resolved','bug','2025-01-10','2025-01-11',5),"
            "(2,1,3,'Новый виджет','medium','closed','feature_request','2025-01-15','2025-02-01',4),"
            "(3,2,1,'Не работает вход','critical','resolved','incident','2025-01-20','2025-01-20',3),"
            "(4,3,4,'Вопрос по API','low','resolved','question','2025-02-01','2025-02-03',5),"
            "(5,3,3,'Ошибка импорта','high','resolved','bug','2025-02-10','2025-02-12',4),"
            "(6,4,2,'Не загружается страница','medium','in_progress','bug','2025-02-15',NULL,NULL),"
            "(7,1,5,'Интеграция с 1С','high','in_progress','feature_request','2025-03-01',NULL,NULL),"
            "(8,5,1,'Потеря данных','critical','resolved','incident','2025-03-05','2025-03-05',2),"
            "(9,2,NULL,'Тарифный вопрос','low','open','question','2025-03-10',NULL,NULL),"
            "(10,3,4,'Дубли записей','medium','resolved','bug','2025-03-15','2025-03-18',5),"
            "(11,5,3,'Медленный отчёт','high','waiting','bug','2025-03-20',NULL,NULL),"
            "(12,1,2,'Доступ к логам','low','resolved','question','2025-04-01','2025-04-02',4),"
            "(13,4,NULL,'Удаление аккаунта','medium','open','question','2025-04-05',NULL,NULL),"
            "(14,3,5,'Падение сервера','critical','resolved','incident','2025-04-10','2025-04-10',3),"
            "(15,2,1,'Ошибка оплаты','high','resolved','bug','2025-04-15','2025-04-17',4);",
            "INSERT INTO ticket_messages VALUES "
            "(1,1,'client','Отчёт выдаёт неверные суммы за январь.','2025-01-10'),"
            "(2,1,'agent','Проверяю данные, ошибка в агрегации.','2025-01-10'),"
            "(3,1,'agent','Исправлено, проверьте.','2025-01-11'),"
            "(4,1,'client','Спасибо, всё работает!','2025-01-11'),"
            "(5,3,'client','Не могу войти в систему, ошибка 500.','2025-01-20'),"
            "(6,3,'agent','Перезапустил сервис авторизации.','2025-01-20'),"
            "(7,6,'client','Главная страница не загружается.','2025-02-15'),"
            "(8,6,'agent','Воспроизвожу проблему, передаю L2.','2025-02-16'),"
            "(9,8,'client','После обновления пропали данные за март.','2025-03-05'),"
            "(10,8,'agent','Данные восстановлены из бэкапа.','2025-03-05');",
        ],
    },
}


# ──────────────────────────────────────────────
#  Example records
# ──────────────────────────────────────────────

def _get_schema(db_id: str) -> str:
    return DATABASES[db_id]["schema"].strip()


def _build_examples() -> list[dict]:
    """Build all examples. Each is a dict matching example_record.schema.json."""
    examples: list[dict] = []
    _id = 0

    # ── TRAIN: shop database ──
    shop_train = [
        {
            "question_ru": "Покажи названия всех категорий товаров.",
            "sql": "SELECT name FROM categories;",
            "explanation_ru": "Выбираем все названия из таблицы категорий.",
            "difficulty": "easy",
            "concepts": ["select"],
        },
        {
            "question_ru": "Сколько всего клиентов зарегистрировано?",
            "sql": "SELECT COUNT(*) FROM customers;",
            "explanation_ru": "Считаем общее количество записей в таблице customers.",
            "difficulty": "easy",
            "concepts": ["select", "aggregate"],
        },
        {
            "question_ru": "Покажи имена и email клиентов из Москвы.",
            "sql": "SELECT name, email FROM customers WHERE city = 'Москва';",
            "explanation_ru": "Фильтруем клиентов по городу Москва.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Какие товары стоят дороже 5000 рублей? Покажи название и цену.",
            "sql": "SELECT name, price FROM products WHERE price > 5000;",
            "explanation_ru": "Фильтруем продукты по цене > 5000.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Покажи товары из категории «Электроника» с ценой и остатком.",
            "sql": "SELECT p.name, p.price, p.in_stock FROM products p JOIN categories c ON p.category_id = c.id WHERE c.name = 'Электроника';",
            "explanation_ru": "Соединяем products и categories, фильтруем по названию категории.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "alias"],
        },
        {
            "question_ru": "Сколько заказов имеет каждый статус?",
            "sql": "SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status;",
            "explanation_ru": "Группируем заказы по статусу и считаем количество.",
            "difficulty": "easy",
            "concepts": ["select", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи топ-3 самых дорогих товара.",
            "sql": "SELECT name, price FROM products ORDER BY price DESC LIMIT 3;",
            "explanation_ru": "Сортируем товары по убыванию цены и берём 3 первых.",
            "difficulty": "easy",
            "concepts": ["select", "order_by", "limit"],
        },
        {
            "question_ru": "Какова средняя стоимость товаров в каждой категории?",
            "sql": "SELECT c.name, AVG(p.price) AS avg_price FROM products p JOIN categories c ON p.category_id = c.id GROUP BY c.name;",
            "explanation_ru": "Соединяем products с categories, группируем по категории, считаем среднюю цену.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Найди клиентов, которые сделали более одного заказа. Покажи имя и количество заказов.",
            "sql": "SELECT c.name, COUNT(o.id) AS order_count FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.id, c.name HAVING COUNT(o.id) > 1;",
            "explanation_ru": "Соединяем customers с orders, группируем по клиенту, фильтруем по HAVING > 1.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "having", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи общую сумму каждого заказа.",
            "sql": "SELECT order_id, SUM(quantity * unit_price) AS total FROM order_items GROUP BY order_id;",
            "explanation_ru": "Группируем позиции по заказу и суммируем стоимость (количество × цена).",
            "difficulty": "medium",
            "concepts": ["select", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Какие товары ни разу не были заказаны?",
            "sql": "SELECT p.name FROM products p WHERE p.id NOT IN (SELECT DISTINCT product_id FROM order_items);",
            "explanation_ru": "Находим товары, id которых отсутствует среди заказанных позиций.",
            "difficulty": "medium",
            "concepts": ["select", "where", "subquery", "distinct"],
        },
        {
            "question_ru": "Покажи заказы, сделанные в первом квартале 2025 года, с именем клиента.",
            "sql": "SELECT o.id, c.name, o.created_at, o.status FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.created_at BETWEEN '2025-01-01' AND '2025-03-31';",
            "explanation_ru": "Соединяем заказы с клиентами и фильтруем по дате в диапазоне Q1 2025.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "between"],
        },
        {
            "question_ru": "Найди клиентов, имя которых содержит «ов».",
            "sql": "SELECT name, email FROM customers WHERE name LIKE '%ов%';",
            "explanation_ru": "Ищем клиентов с подстрокой «ов» в имени через LIKE.",
            "difficulty": "easy",
            "concepts": ["select", "where", "like"],
        },
        {
            "question_ru": "Покажи 5 самых крупных заказов по сумме с именем клиента.",
            "sql": "SELECT c.name, o.id AS order_id, SUM(oi.quantity * oi.unit_price) AS total FROM orders o JOIN customers c ON o.customer_id = c.id JOIN order_items oi ON o.id = oi.order_id GROUP BY o.id, c.name ORDER BY total DESC LIMIT 5;",
            "explanation_ru": "Соединяем три таблицы, группируем по заказу, сортируем по сумме и берём топ-5.",
            "difficulty": "hard",
            "concepts": ["select", "join", "group_by", "aggregate", "order_by", "limit", "alias"],
        },
        {
            "question_ru": "Покажи количество товаров в каждой категории, где товаров больше одного.",
            "sql": "SELECT c.name, COUNT(p.id) AS product_count FROM categories c JOIN products p ON c.id = p.category_id GROUP BY c.name HAVING COUNT(p.id) > 1;",
            "explanation_ru": "Считаем товары по категориям и оставляем только те, где > 1.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "having", "aggregate", "alias"],
        },
        {
            "question_ru": "Есть ли клиенты без заказов? Покажи их имена.",
            "sql": "SELECT c.name FROM customers c LEFT JOIN orders o ON c.id = o.customer_id WHERE o.id IS NULL;",
            "explanation_ru": "LEFT JOIN с проверкой IS NULL находит клиентов без совпадений в orders.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "is_null"],
        },
        {
            "question_ru": "Для каждого клиента покажи сумму всех доставленных заказов.",
            "sql": "SELECT c.name, SUM(oi.quantity * oi.unit_price) AS delivered_total FROM customers c JOIN orders o ON c.id = o.customer_id JOIN order_items oi ON o.id = oi.order_id WHERE o.status = 'delivered' GROUP BY c.id, c.name;",
            "explanation_ru": "Фильтруем заказы со статусом delivered, соединяем с клиентами и позициями, суммируем.",
            "difficulty": "hard",
            "concepts": ["select", "join", "where", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи товары с пометкой дорого/дёшево: дороже 10000 — «дорого», иначе «доступно».",
            "sql": "SELECT name, price, CASE WHEN price > 10000 THEN 'дорого' ELSE 'доступно' END AS price_label FROM products;",
            "explanation_ru": "Используем CASE WHEN для классификации товаров по цене.",
            "difficulty": "medium",
            "concepts": ["select", "case_when", "alias"],
        },
        {
            "question_ru": "Какие товары есть в наличии (больше нуля) и дешевле 1000 рублей?",
            "sql": "SELECT name FROM products WHERE in_stock > 0 AND price < 1000;",
            "explanation_ru": "Фильтруем по наличию на складе и цене.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Покажи суммарную стоимость всех товаров на складе (цена * количество).",
            "sql": "SELECT SUM(price * in_stock) AS total_inventory_value FROM products;",
            "explanation_ru": "Умножаем цену на количество и суммируем.",
            "difficulty": "medium",
            "concepts": ["select", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи заказы, сделанные после 1 апреля 2025 года.",
            "sql": "SELECT id, status FROM orders WHERE created_at > '2025-04-01';",
            "explanation_ru": "Фильтруем заказы по дате создания.",
            "difficulty": "easy",
            "concepts": ["select", "where", "date"],
        },
        {
            "question_ru": "Сколько уникальных товаров было продано?",
            "sql": "SELECT COUNT(DISTINCT product_id) FROM order_items;",
            "explanation_ru": "Считаем уникальные product_id в позициях заказов.",
            "difficulty": "medium",
            "concepts": ["select", "aggregate", "distinct"],
        },
        {
            "question_ru": "Найди клиента с самым старым заказом.",
            "sql": "SELECT c.name FROM customers c JOIN orders o ON c.id = o.customer_id ORDER BY o.created_at ASC LIMIT 1;",
            "explanation_ru": "Сортируем по дате возрастания и берем первую запись.",
            "difficulty": "medium",
            "concepts": ["select", "join", "order_by", "limit"],
        },
    ]

    for i, ex in enumerate(shop_train):
        _id += 1
        examples.append({
            "id": f"shop_train_{_id:03d}",
            "database_id": "shop",
            "schema_sql": _get_schema("shop"),
            "question_ru": ex["question_ru"],
            "sql": ex["sql"],
            "explanation_ru": ex["explanation_ru"],
            "assumptions": ex.get("assumptions", []),
            "difficulty": ex["difficulty"],
            "concepts": ex["concepts"],
            "split": "train",
            "context": "",
        })

    # ── TRAIN: hr database ──
    hr_train = [
        {
            "question_ru": "Покажи список всех отделов.",
            "sql": "SELECT name FROM departments;",
            "explanation_ru": "Выбираем названия всех отделов.",
            "difficulty": "easy",
            "concepts": ["select"],
        },
        {
            "question_ru": "Сколько сотрудников работает в каждом отделе?",
            "sql": "SELECT d.name, COUNT(e.id) AS emp_count FROM departments d JOIN employees e ON d.id = e.department_id GROUP BY d.name;",
            "explanation_ru": "Соединяем отделы с сотрудниками и считаем количество по отделу.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Кто получает зарплату выше 150000?",
            "sql": "SELECT first_name, last_name, salary FROM employees WHERE salary > 150000;",
            "explanation_ru": "Фильтруем сотрудников по зарплате > 150000.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Покажи все активные проекты с названием отдела.",
            "sql": "SELECT p.name AS project_name, d.name AS department_name FROM projects p JOIN departments d ON p.department_id = d.id WHERE p.status = 'active';",
            "explanation_ru": "Соединяем проекты с отделами, фильтруем по статусу active.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "alias"],
        },
        {
            "question_ru": "Какая средняя зарплата по отделам?",
            "sql": "SELECT d.name, AVG(e.salary) AS avg_salary FROM departments d JOIN employees e ON d.id = e.department_id GROUP BY d.name;",
            "explanation_ru": "Группируем сотрудников по отделу и считаем среднюю зарплату.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи сотрудников, нанятых после 2023 года.",
            "sql": "SELECT first_name, last_name, hire_date FROM employees WHERE hire_date >= '2024-01-01';",
            "explanation_ru": "Фильтруем сотрудников по дате найма начиная с 2024.",
            "difficulty": "easy",
            "concepts": ["select", "where", "date"],
        },
        {
            "question_ru": "Сколько часов выделено на каждый проект?",
            "sql": "SELECT p.name, SUM(pa.hours_allocated) AS total_hours FROM projects p JOIN project_assignments pa ON p.id = pa.project_id GROUP BY p.name;",
            "explanation_ru": "Суммируем часы из назначений по каждому проекту.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Найди сотрудников, которые не назначены ни на один проект.",
            "sql": "SELECT e.first_name, e.last_name FROM employees e WHERE e.id NOT IN (SELECT DISTINCT employee_id FROM project_assignments);",
            "explanation_ru": "Подзапрос находит назначенных сотрудников; внешний запрос — кого среди них нет.",
            "difficulty": "medium",
            "concepts": ["select", "where", "subquery", "distinct"],
        },
        {
            "question_ru": "Покажи руководителей (у кого есть подчинённые) и количество подчинённых.",
            "sql": "SELECT m.first_name, m.last_name, COUNT(e.id) AS subordinates FROM employees e JOIN employees m ON e.manager_id = m.id GROUP BY m.id, m.first_name, m.last_name;",
            "explanation_ru": "Self-join: соединяем сотрудников с их менеджерами и считаем подчинённых.",
            "difficulty": "hard",
            "concepts": ["select", "join", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи проекты, на которые назначено более 2 сотрудников.",
            "sql": "SELECT p.name, COUNT(pa.employee_id) AS member_count FROM projects p JOIN project_assignments pa ON p.id = pa.project_id GROUP BY p.name HAVING COUNT(pa.employee_id) > 2;",
            "explanation_ru": "Считаем назначенных на проект сотрудников и фильтруем HAVING > 2.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "having", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи ФИО сотрудников и их должности в отделе «Разработка», отсортированные по зарплате.",
            "sql": "SELECT e.first_name, e.last_name, e.position, e.salary FROM employees e JOIN departments d ON e.department_id = d.id WHERE d.name = 'Разработка' ORDER BY e.salary DESC;",
            "explanation_ru": "Фильтруем по отделу Разработка и сортируем по зарплате.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "order_by"],
        },
        {
            "question_ru": "Какой отдел имеет самый большой бюджет?",
            "sql": "SELECT name, budget FROM departments ORDER BY budget DESC LIMIT 1;",
            "explanation_ru": "Сортируем отделы по бюджету и берём первый.",
            "difficulty": "easy",
            "concepts": ["select", "order_by", "limit"],
        },
        {
            "question_ru": "Покажи сотрудников, чья фамилия начинается на 'С'.",
            "sql": "SELECT first_name, last_name FROM employees WHERE last_name LIKE 'С%';",
            "explanation_ru": "Поиск по фамилии через LIKE.",
            "difficulty": "easy",
            "concepts": ["select", "where", "like"],
        },
        {
            "question_ru": "Какова разница между максимальной и минимальной зарплатой в компании?",
            "sql": "SELECT MAX(salary) - MIN(salary) AS salary_diff FROM employees;",
            "explanation_ru": "Вычисляем разницу между максимальной и минимальной зарплатой.",
            "difficulty": "medium",
            "concepts": ["select", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи список проектов, завершенных до сентября 2024 года.",
            "sql": "SELECT name FROM projects WHERE status = 'completed' AND end_date < '2024-09-01';",
            "explanation_ru": "Фильтруем по статусу и дате завершения.",
            "difficulty": "medium",
            "concepts": ["select", "where", "date"],
        },
        {
            "question_ru": "Сколько часов выделено на проект 'CRM система'?",
            "sql": "SELECT SUM(pa.hours_allocated) AS total_hours FROM project_assignments pa JOIN projects p ON pa.project_id = p.id WHERE p.name = 'CRM система';",
            "explanation_ru": "Соединяем таблицы и фильтруем по названию проекта.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи всех Junior сотрудников (в чьей должности есть слово Junior).",
            "sql": "SELECT first_name, last_name, position FROM employees WHERE position LIKE '%Junior%';",
            "explanation_ru": "Ищем слово Junior в названии должности.",
            "difficulty": "easy",
            "concepts": ["select", "where", "like"],
        },
    ]

    for i, ex in enumerate(hr_train):
        _id += 1
        examples.append({
            "id": f"hr_train_{_id:03d}",
            "database_id": "hr",
            "schema_sql": _get_schema("hr"),
            "question_ru": ex["question_ru"],
            "sql": ex["sql"],
            "explanation_ru": ex["explanation_ru"],
            "assumptions": ex.get("assumptions", []),
            "difficulty": ex["difficulty"],
            "concepts": ex["concepts"],
            "split": "train",
            "context": "",
        })

    # ── VALIDATION: shop + hr (held-out questions, same schemas) ──
    val_examples = [
        {
            "database_id": "shop",
            "question_ru": "Покажи уникальные города клиентов.",
            "sql": "SELECT DISTINCT city FROM customers;",
            "explanation_ru": "Выбираем уникальные значения города из таблицы клиентов.",
            "difficulty": "easy",
            "concepts": ["select", "distinct"],
        },
        {
            "database_id": "shop",
            "question_ru": "Какой клиент потратил больше всего денег? Покажи имя и сумму.",
            "sql": "SELECT c.name, SUM(oi.quantity * oi.unit_price) AS total_spent FROM customers c JOIN orders o ON c.id = o.customer_id JOIN order_items oi ON o.id = oi.order_id GROUP BY c.id, c.name ORDER BY total_spent DESC LIMIT 1;",
            "explanation_ru": "Соединяем три таблицы, суммируем стоимость по клиенту, берём максимум.",
            "difficulty": "hard",
            "concepts": ["select", "join", "group_by", "aggregate", "order_by", "limit", "alias"],
        },
        {
            "database_id": "shop",
            "question_ru": "Покажи товары из категории «Книги» или «Продукты».",
            "sql": "SELECT p.name, p.price FROM products p JOIN categories c ON p.category_id = c.id WHERE c.name IN ('Книги', 'Продукты');",
            "explanation_ru": "Фильтруем товары по принадлежности к категориям через IN.",
            "difficulty": "easy",
            "concepts": ["select", "join", "where", "in"],
        },
        {
            "database_id": "shop",
            "question_ru": "Сколько отменённых заказов было сделано?",
            "sql": "SELECT COUNT(*) FROM orders WHERE status = 'cancelled';",
            "explanation_ru": "Считаем заказы со статусом cancelled.",
            "difficulty": "easy",
            "concepts": ["select", "where", "aggregate"],
        },
        {
            "database_id": "hr",
            "question_ru": "Покажи сотрудников с зарплатой ниже средней по компании.",
            "sql": "SELECT first_name, last_name, salary FROM employees WHERE salary < (SELECT AVG(salary) FROM employees);",
            "explanation_ru": "Подзапрос вычисляет среднюю зарплату, внешний запрос фильтрует.",
            "difficulty": "medium",
            "concepts": ["select", "where", "subquery", "aggregate"],
        },
        {
            "database_id": "hr",
            "question_ru": "В каких отделах средняя зарплата превышает 130000?",
            "sql": "SELECT d.name, AVG(e.salary) AS avg_salary FROM departments d JOIN employees e ON d.id = e.department_id GROUP BY d.name HAVING AVG(e.salary) > 130000;",
            "explanation_ru": "Группируем по отделу, считаем среднюю зарплату, фильтруем HAVING.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "having", "aggregate", "alias"],
        },
        {
            "database_id": "hr",
            "question_ru": "Покажи роли сотрудников на активных проектах.",
            "sql": "SELECT e.first_name, e.last_name, p.name AS project_name, pa.role FROM project_assignments pa JOIN employees e ON pa.employee_id = e.id JOIN projects p ON pa.project_id = p.id WHERE p.status = 'active';",
            "explanation_ru": "Соединяем три таблицы и фильтруем по активным проектам.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "alias"],
        },
        {
            "database_id": "hr",
            "question_ru": "Покажи минимальную и максимальную зарплату по каждому отделу.",
            "sql": "SELECT d.name, MIN(e.salary) AS min_salary, MAX(e.salary) AS max_salary FROM departments d JOIN employees e ON d.id = e.department_id GROUP BY d.name;",
            "explanation_ru": "Группируем по отделу, находим MIN и MAX зарплаты.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "aggregate", "alias"],
        },
    ]

    for i, ex in enumerate(val_examples):
        _id += 1
        db = ex["database_id"]
        examples.append({
            "id": f"{db}_val_{_id:03d}",
            "database_id": db,
            "schema_sql": _get_schema(db),
            "question_ru": ex["question_ru"],
            "sql": ex["sql"],
            "explanation_ru": ex["explanation_ru"],
            "assumptions": ex.get("assumptions", []),
            "difficulty": ex["difficulty"],
            "concepts": ex["concepts"],
            "split": "validation",
            "context": "",
        })

    # ── TEST: support database ONLY (separate schema for transfer) ──
    test_examples = [
        {
            "question_ru": "Сколько всего тикетов создано?",
            "sql": "SELECT COUNT(*) FROM tickets;",
            "explanation_ru": "Считаем общее количество тикетов.",
            "difficulty": "easy",
            "concepts": ["select", "aggregate"],
        },
        {
            "question_ru": "Покажи открытые тикеты с темой и приоритетом.",
            "sql": "SELECT subject, priority FROM tickets WHERE status = 'open';",
            "explanation_ru": "Фильтруем тикеты по статусу open.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Сколько тикетов обработал каждый агент? Покажи имя и количество.",
            "sql": "SELECT a.name, COUNT(t.id) AS ticket_count FROM agents a JOIN tickets t ON a.id = t.agent_id GROUP BY a.id, a.name;",
            "explanation_ru": "Соединяем агентов с тикетами и считаем количество по агенту.",
            "difficulty": "medium",
            "concepts": ["select", "join", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Какие компании подали критические тикеты?",
            "sql": "SELECT DISTINCT c.company_name FROM clients c JOIN tickets t ON c.id = t.client_id WHERE t.priority = 'critical';",
            "explanation_ru": "Находим уникальные компании с критическими тикетами.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "distinct"],
        },
        {
            "question_ru": "Покажи среднюю оценку удовлетворённости по каждой категории тикетов.",
            "sql": "SELECT category, AVG(satisfaction_score) AS avg_score FROM tickets WHERE satisfaction_score IS NOT NULL GROUP BY category;",
            "explanation_ru": "Группируем по категории и считаем среднюю оценку, исключая NULL.",
            "difficulty": "medium",
            "concepts": ["select", "where", "group_by", "aggregate", "is_null", "alias"],
        },
        {
            "question_ru": "Какие тикеты ещё не назначены ни одному агенту?",
            "sql": "SELECT id, subject, status FROM tickets WHERE agent_id IS NULL;",
            "explanation_ru": "Ищем тикеты без назначенного агента (agent_id IS NULL).",
            "difficulty": "easy",
            "concepts": ["select", "where", "is_null"],
        },
        {
            "question_ru": "Покажи клиентов с тарифом premium или enterprise, у которых есть тикеты.",
            "sql": "SELECT DISTINCT c.company_name, c.plan FROM clients c JOIN tickets t ON c.id = t.client_id WHERE c.plan IN ('premium', 'enterprise');",
            "explanation_ru": "Соединяем клиентов с тикетами и фильтруем по тарифу.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "in", "distinct"],
        },
        {
            "question_ru": "Покажи топ-3 агентов по количеству решённых тикетов.",
            "sql": "SELECT a.name, COUNT(t.id) AS resolved_count FROM agents a JOIN tickets t ON a.id = t.agent_id WHERE t.status = 'resolved' GROUP BY a.id, a.name ORDER BY resolved_count DESC LIMIT 3;",
            "explanation_ru": "Фильтруем решённые тикеты, считаем по агенту, сортируем и берём топ-3.",
            "difficulty": "hard",
            "concepts": ["select", "join", "where", "group_by", "aggregate", "order_by", "limit", "alias"],
        },
        {
            "question_ru": "Сколько сообщений написано по каждому тикету?",
            "sql": "SELECT ticket_id, COUNT(*) AS msg_count FROM ticket_messages GROUP BY ticket_id;",
            "explanation_ru": "Группируем сообщения по ticket_id и считаем.",
            "difficulty": "easy",
            "concepts": ["select", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Покажи тикеты с багами, решённые более чем за 1 день.",
            "sql": "SELECT t.id, t.subject, t.created_at, t.resolved_at FROM tickets t WHERE t.category = 'bug' AND t.resolved_at IS NOT NULL AND julianday(t.resolved_at) - julianday(t.created_at) > 1;",
            "explanation_ru": "Фильтруем по категории bug, наличию даты решения и разнице дат > 1 дня.",
            "difficulty": "hard",
            "concepts": ["select", "where", "date", "is_null"],
        },
        {
            "question_ru": "Покажи количество тикетов по приоритету, где тикетов больше двух.",
            "sql": "SELECT priority, COUNT(*) AS cnt FROM tickets GROUP BY priority HAVING COUNT(*) > 2;",
            "explanation_ru": "Группируем по приоритету, фильтруем HAVING > 2.",
            "difficulty": "medium",
            "concepts": ["select", "group_by", "having", "aggregate", "alias"],
        },
        {
            "question_ru": "Для каждого агента покажи количество тикетов и пометку: если больше 3 — «высокая нагрузка», иначе «нормальная».",
            "sql": "SELECT a.name, COUNT(t.id) AS cnt, CASE WHEN COUNT(t.id) > 3 THEN 'высокая нагрузка' ELSE 'нормальная' END AS workload FROM agents a JOIN tickets t ON a.id = t.agent_id GROUP BY a.id, a.name;",
            "explanation_ru": "Считаем тикеты по агенту и классифицируем нагрузку через CASE WHEN.",
            "difficulty": "hard",
            "concepts": ["select", "join", "group_by", "aggregate", "case_when", "alias"],
        },
        {
            "question_ru": "Покажи среднее время решения тикетов (в днях) по командам агентов.",
            "sql": "SELECT a.team, AVG(julianday(t.resolved_at) - julianday(t.created_at)) AS avg_days FROM agents a JOIN tickets t ON a.id = t.agent_id WHERE t.resolved_at IS NOT NULL GROUP BY a.team;",
            "explanation_ru": "Соединяем агентов с тикетами, считаем разницу дат, группируем по команде.",
            "difficulty": "hard",
            "concepts": ["select", "join", "where", "group_by", "aggregate", "date", "alias"],
        },
        {
            "question_ru": "Есть ли клиенты без тикетов? Покажи название компании.",
            "sql": "SELECT c.company_name FROM clients c LEFT JOIN tickets t ON c.id = t.client_id WHERE t.id IS NULL;",
            "explanation_ru": "LEFT JOIN находит клиентов без совпадений в tickets.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "is_null"],
        },
    ]

    for i, ex in enumerate(test_examples):
        _id += 1
        examples.append({
            "id": f"support_test_{_id:03d}",
            "database_id": "support",
            "schema_sql": _get_schema("support"),
            "question_ru": ex["question_ru"],
            "sql": ex["sql"],
            "explanation_ru": ex["explanation_ru"],
            "assumptions": ex.get("assumptions", []),
            "difficulty": ex["difficulty"],
            "concepts": ex["concepts"],
            "split": "test",
            "context": "",
        })

    return examples


# ──────────────────────────────────────────────
#  Build functions
# ──────────────────────────────────────────────

def create_database(db_id: str) -> Path:
    """Create a SQLite database from schema + seed data. Idempotent."""
    db_path = DB_DIR / f"{db_id}.sqlite"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON;")
    db_info = DATABASES[db_id]
    conn.executescript(db_info["schema"])
    for stmt in db_info["seed_data"]:
        conn.executescript(stmt)
    conn.commit()

    # Verify tables exist
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    conn.close()
    print(f"  Created {db_path.name}: {len(tables)} tables")
    return db_path


def write_jsonl(examples: list[dict], path: Path) -> None:
    """Write examples to JSONL with stable field order."""
    field_order = [
        "id", "database_id", "schema_sql", "question_ru", "sql",
        "explanation_ru", "assumptions", "difficulty", "concepts",
        "split", "context",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for ex in examples:
            ordered = {k: ex[k] for k in field_order if k in ex}
            f.write(json.dumps(ordered, ensure_ascii=False) + "\n")


def build_all() -> dict:
    """Main entry point. Returns stats dict."""
    print("Building seed dataset...")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DB_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Create databases
    print("\n[1/3] Creating SQLite databases:")
    for db_id in DATABASES:
        create_database(db_id)

    # 2. Generate examples
    print("\n[2/3] Generating examples:")
    all_examples = _build_examples()

    # 3. Write JSONL files per split + combined
    print("\n[3/3] Writing JSONL files:")
    splits: dict[str, list[dict]] = {}
    for ex in all_examples:
        splits.setdefault(ex["split"], []).append(ex)

    for split_name, split_data in sorted(splits.items()):
        path = DATA_DIR / f"{split_name}.jsonl"
        write_jsonl(split_data, path)
        print(f"  {path.name}: {len(split_data)} examples")

    combined_path = DATA_DIR / "all.jsonl"
    write_jsonl(all_examples, combined_path)
    print(f"  all.jsonl: {len(all_examples)} examples (combined)")

    # Stats
    stats = {
        "total": len(all_examples),
        "splits": {s: len(d) for s, d in sorted(splits.items())},
        "databases": list(DATABASES.keys()),
        "difficulties": {},
        "concepts": {},
    }
    for ex in all_examples:
        d = ex["difficulty"]
        stats["difficulties"][d] = stats["difficulties"].get(d, 0) + 1
        for c in ex["concepts"]:
            stats["concepts"][c] = stats["concepts"].get(c, 0) + 1

    print(f"\nTotal: {stats['total']} examples")
    print(f"Splits: {stats['splits']}")
    print(f"Databases: {stats['databases']}")
    print(f"Difficulties: {stats['difficulties']}")
    print("Done!")
    return stats


if __name__ == "__main__":
    build_all()
