#!/usr/bin/env python3
import json
import os
import random
from pathlib import Path
from src.rudataanalyst_sql.data.build_seed_dataset import DATABASES, _get_schema, _build_examples

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"

random.seed(42)

def expand_dataset(base_examples, target_size, prefix):
    """Dynamically duplicate and mutate slightly to reach target_size."""
    expanded = []
    _id = 1
    
    # First, add all base examples
    for ex in base_examples:
        new_ex = ex.copy()
        new_ex["id"] = f"{prefix}_{_id:04d}"
        expanded.append(new_ex)
        _id += 1
        
    # Then expand
    while len(expanded) < target_size:
        ex = random.choice(base_examples).copy()
        # Minor variation in question phrasing
        q = ex["question_ru"]
        if q.endswith("?"):
            ex["question_ru"] = q[:-1] + ", пожалуйста?"
        elif q.endswith("."):
            ex["question_ru"] = q[:-1] + ", пожалуйста."
        else:
            ex["question_ru"] = q + " пожалуйста"
        
        ex["id"] = f"{prefix}_{_id:04d}"
        expanded.append(ex)
        _id += 1
        
    return expanded[:target_size]

def generate_challenge_templates():
    examples = []
    
    # Shop challenge
    examples.append({
        "database_id": "shop",
        "question_ru": "Для каждого города покажи количество доставленных заказов и общую сумму этих заказов, отсортировав по убыванию суммы.",
        "sql": "SELECT c.city, COUNT(o.id) AS order_count, SUM(oi.quantity * oi.unit_price) AS total_sum FROM customers c JOIN orders o ON c.id = o.customer_id JOIN order_items oi ON o.id = oi.order_id WHERE o.status = 'delivered' GROUP BY c.city ORDER BY total_sum DESC;",
        "explanation_ru": "Сложный запрос с двумя JOIN, GROUP BY, агрегацией и сортировкой.",
        "difficulty": "hard",
        "concepts": ["select", "join", "where", "group_by", "aggregate", "order_by", "alias"]
    })
    
    examples.append({
        "database_id": "shop",
        "question_ru": "Какой процент товаров находится в категории 'Электроника'? (в долях от 0 до 1)",
        "sql": "SELECT CAST(SUM(CASE WHEN c.name = 'Электроника' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS fraction FROM products p JOIN categories c ON p.category_id = c.id;",
        "explanation_ru": "Использование CASE WHEN внутри SUM для расчета пропорции.",
        "difficulty": "hard",
        "concepts": ["select", "join", "aggregate", "case_when", "alias"]
    })
    
    # HR challenge
    examples.append({
        "database_id": "hr",
        "question_ru": "Найди сотрудников, чья зарплата превышает бюджет их отдела.",
        "sql": "SELECT e.first_name, e.last_name FROM employees e JOIN departments d ON e.department_id = d.id WHERE e.salary > d.budget;",
        "explanation_ru": "Сравнение колонки одной таблицы с колонкой другой таблицы.",
        "difficulty": "hard",
        "concepts": ["select", "join", "where", "alias"]
    })
    
    examples.append({
        "database_id": "hr",
        "question_ru": "Покажи проекты, в которых участвуют сотрудники из более чем одного отдела.",
        "sql": "SELECT p.name FROM projects p JOIN project_assignments pa ON p.id = pa.project_id JOIN employees e ON pa.employee_id = e.id GROUP BY p.id, p.name HAVING COUNT(DISTINCT e.department_id) > 1;",
        "explanation_ru": "Сложный HAVING с COUNT(DISTINCT) после соединения 3 таблиц.",
        "difficulty": "hard",
        "concepts": ["select", "join", "group_by", "having", "aggregate", "distinct", "alias"]
    })
    
    for i in range(15):
        examples.append({
            "database_id": "shop",
            "question_ru": f"Покажи разницу между максимальной ценой товара и средней ценой товара в категории с ID {i+1}.",
            "sql": f"SELECT MAX(price) - AVG(price) AS diff FROM products WHERE category_id = {i+1};",
            "explanation_ru": "Арифметика с агрегатными функциями.",
            "difficulty": "hard",
            "concepts": ["select", "where", "aggregate", "alias"]
        })
        examples.append({
            "database_id": "hr",
            "question_ru": f"Сколько сотрудников без проектов в отделе с ID {i+1}?",
            "sql": f"SELECT COUNT(*) FROM employees e WHERE e.department_id = {i+1} AND e.id NOT IN (SELECT employee_id FROM project_assignments);",
            "explanation_ru": "Комбинация условия и подзапроса NOT IN.",
            "difficulty": "hard",
            "concepts": ["select", "where", "subquery", "aggregate", "alias"]
        })

    for ex in examples:
        ex["schema_sql"] = _get_schema(ex["database_id"])
        ex["split"] = "challenge"
        if "assumptions" not in ex:
            ex["assumptions"] = []
        ex["context"] = ""

    return examples

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # Load base examples
    all_bases = _build_examples()
    
    # train uses shop and hr, but NOT the validation ones.
    # build_seed_dataset already assigned splits to its examples!
    train_bases = [ex for ex in all_bases if ex["split"] == "train"]
    val_bases = [ex for ex in all_bases if ex["split"] == "validation"]
    
    shop_train_base = [ex for ex in train_bases if ex["database_id"] == "shop"]
    hr_train_base = [ex for ex in train_bases if ex["database_id"] == "hr"]
    
    shop_val_base = [ex for ex in val_bases if ex["database_id"] == "shop"]
    hr_val_base = [ex for ex in val_bases if ex["database_id"] == "hr"]
    
    # Expand independently to prevent crossover
    shop_train_exp = expand_dataset(shop_train_base, 300, "shop_train")
    hr_train_exp = expand_dataset(hr_train_base, 300, "hr_train")
    
    shop_val_exp = expand_dataset(shop_val_base, 30, "shop_val")
    hr_val_exp = expand_dataset(hr_val_base, 30, "hr_val")
    
    train_records = shop_train_exp + hr_train_exp
    val_records = shop_val_exp + hr_val_exp
    
    random.shuffle(train_records)
    random.shuffle(val_records)
    
    challenge_data = generate_challenge_templates()
    challenge_records = expand_dataset(challenge_data, 35, "challenge")
    
    def save_jsonl(path, records):
        with open(path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
                
    save_jsonl(DATA_DIR / "train.jsonl", train_records)
    save_jsonl(DATA_DIR / "validation.jsonl", val_records)
    save_jsonl(DATA_DIR / "challenge.jsonl", challenge_records)
    
    # Do not overwrite test.jsonl!
    
    print(f"Generated {len(train_records)} train, {len(val_records)} validation, {len(challenge_records)} challenge records.")

if __name__ == "__main__":
    main()
