import sys
from pathlib import Path

def main():
    file_path = Path("src/rudataanalyst_sql/data/build_seed_dataset.py")
    content = file_path.read_text()
    
    # We'll inject support_train and support_val before "── TEST: support database ONLY"
    
    support_train = '''
    # ── TRAIN: support database ──
    support_train = [
        {
            "question_ru": "Покажи названия всех команд агентов.",
            "sql": "SELECT DISTINCT team FROM agents;",
            "explanation_ru": "Выбираем уникальные команды агентов.",
            "difficulty": "easy",
            "concepts": ["select", "distinct"],
        },
        {
            "question_ru": "Сколько клиентов зарегистрировано в системе?",
            "sql": "SELECT COUNT(id) FROM clients;",
            "explanation_ru": "Считаем количество записей клиентов.",
            "difficulty": "easy",
            "concepts": ["select", "aggregate"],
        },
        {
            "question_ru": "Покажи имена активных агентов.",
            "sql": "SELECT name FROM agents WHERE is_active = 1;",
            "explanation_ru": "Фильтруем агентов по статусу активности.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Какие клиенты используют тариф free?",
            "sql": "SELECT company_name FROM clients WHERE plan = 'free';",
            "explanation_ru": "Фильтруем клиентов по тарифу.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Для каждого клиента покажи дату его регистрации, отсортировав от самых новых.",
            "sql": "SELECT company_name, registered_at FROM clients ORDER BY registered_at DESC;",
            "explanation_ru": "Выводим названия компаний и даты, сортируем по убыванию.",
            "difficulty": "easy",
            "concepts": ["select", "order_by"],
        },
        {
            "question_ru": "Покажи все сообщения, отправленные системой.",
            "sql": "SELECT message FROM ticket_messages WHERE sender_type = 'system';",
            "explanation_ru": "Фильтруем сообщения по типу отправителя.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Сколько закрытых тикетов в системе?",
            "sql": "SELECT COUNT(id) FROM tickets WHERE status = 'closed';",
            "explanation_ru": "Считаем тикеты со статусом closed.",
            "difficulty": "easy",
            "concepts": ["select", "where", "aggregate"],
        },
        {
            "question_ru": "Выведи имена агентов и их команды, отсортированные по имени.",
            "sql": "SELECT name, team FROM agents ORDER BY name ASC;",
            "explanation_ru": "Простой выбор и сортировка.",
            "difficulty": "easy",
            "concepts": ["select", "order_by"],
        },
        {
            "question_ru": "Какие клиенты зарегистрировались после 1 марта 2023 года?",
            "sql": "SELECT company_name FROM clients WHERE registered_at > '2023-03-01';",
            "explanation_ru": "Фильтр по дате.",
            "difficulty": "easy",
            "concepts": ["select", "where", "date"],
        },
        {
            "question_ru": "Покажи все категории тикетов и их количество.",
            "sql": "SELECT category, COUNT(id) AS cnt FROM tickets GROUP BY category;",
            "explanation_ru": "Группировка по категории с подсчетом количества.",
            "difficulty": "medium",
            "concepts": ["select", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Какая средняя оценка по тикетам с приоритетом high?",
            "sql": "SELECT AVG(satisfaction_score) FROM tickets WHERE priority = 'high';",
            "explanation_ru": "Считаем среднюю оценку только для тикетов с приоритетом high.",
            "difficulty": "medium",
            "concepts": ["select", "where", "aggregate"],
        },
        {
            "question_ru": "Покажи список агентов из команды L1, у которых есть решённые тикеты.",
            "sql": "SELECT DISTINCT a.name FROM agents a JOIN tickets t ON a.id = t.agent_id WHERE a.team = 'L1' AND t.status = 'resolved';",
            "explanation_ru": "Соединяем таблицы, фильтруем по команде и статусу тикета.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "distinct"],
        },
        {
            "question_ru": "Сколько сообщений отправлено каждым клиентом? Выведи название компании и количество.",
            "sql": "SELECT c.company_name, COUNT(tm.id) AS msg_count FROM clients c JOIN tickets t ON c.id = t.client_id JOIN ticket_messages tm ON t.id = tm.ticket_id WHERE tm.sender_type = 'client' GROUP BY c.id, c.company_name;",
            "explanation_ru": "Соединяем три таблицы, фильтруем сообщения клиентов и группируем.",
            "difficulty": "hard",
            "concepts": ["select", "join", "where", "group_by", "aggregate", "alias"],
        },
        {
            "question_ru": "Выведи агента с самым высоким средним баллом удовлетворённости.",
            "sql": "SELECT a.name FROM agents a JOIN tickets t ON a.id = t.agent_id WHERE t.satisfaction_score IS NOT NULL GROUP BY a.id, a.name ORDER BY AVG(t.satisfaction_score) DESC LIMIT 1;",
            "explanation_ru": "Группировка по агенту, сортировка по убыванию среднего балла.",
            "difficulty": "hard",
            "concepts": ["select", "join", "where", "group_by", "aggregate", "order_by", "limit"],
        },
        {
            "question_ru": "Какие клиенты оставляли сообщения в тикетах со статусом waiting?",
            "sql": "SELECT DISTINCT c.company_name FROM clients c JOIN tickets t ON c.id = t.client_id JOIN ticket_messages tm ON t.id = tm.ticket_id WHERE t.status = 'waiting' AND tm.sender_type = 'client';",
            "explanation_ru": "Соединение таблиц, фильтрация по статусу тикета и отправителю.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "distinct"],
        }
    ]

    for i, ex in enumerate(support_train):
        _id += 1
        examples.append({
            "id": f"support_train_{_id:03d}",
            "database_id": "support",
            "schema_sql": _get_schema("support"),
            "question_ru": ex["question_ru"],
            "sql": ex["sql"],
            "explanation_ru": ex["explanation_ru"],
            "assumptions": ex.get("assumptions", []),
            "difficulty": ex["difficulty"],
            "concepts": ex["concepts"],
            "split": "train",
            "context": "",
        })

    # ── VALIDATION: support ──
    support_val = [
        {
            "question_ru": "Покажи список неактивных агентов.",
            "sql": "SELECT name FROM agents WHERE is_active = 0;",
            "explanation_ru": "Фильтр агентов с is_active = 0.",
            "difficulty": "easy",
            "concepts": ["select", "where"],
        },
        {
            "question_ru": "Сколько сообщений со статусом bug?",
            "sql": "SELECT COUNT(tm.id) FROM ticket_messages tm JOIN tickets t ON tm.ticket_id = t.id WHERE t.category = 'bug';",
            "explanation_ru": "Подсчет сообщений в тикетах с категорией bug.",
            "difficulty": "medium",
            "concepts": ["select", "join", "where", "aggregate"],
        },
        {
            "question_ru": "Какие тарифы используют больше одного клиента?",
            "sql": "SELECT plan FROM clients GROUP BY plan HAVING COUNT(id) > 1;",
            "explanation_ru": "Группировка по плану с условием HAVING.",
            "difficulty": "medium",
            "concepts": ["select", "group_by", "having", "aggregate"],
        },
        {
            "question_ru": "Выведи имена клиентов, у которых нет тикетов со статусом closed.",
            "sql": "SELECT company_name FROM clients WHERE id NOT IN (SELECT client_id FROM tickets WHERE status = 'closed');",
            "explanation_ru": "Использование подзапроса NOT IN.",
            "difficulty": "medium",
            "concepts": ["select", "where", "subquery"],
        },
        {
            "question_ru": "Найди тикеты, в которых есть сообщения от системы, но нет сообщений от агента.",
            "sql": "SELECT t.subject FROM tickets t WHERE t.id IN (SELECT ticket_id FROM ticket_messages WHERE sender_type = 'system') AND t.id NOT IN (SELECT ticket_id FROM ticket_messages WHERE sender_type = 'agent');",
            "explanation_ru": "Пересечение условий с подзапросами IN и NOT IN.",
            "difficulty": "hard",
            "concepts": ["select", "where", "subquery"],
        }
    ]

    for i, ex in enumerate(support_val):
        _id += 1
        examples.append({
            "id": f"support_val_{_id:03d}",
            "database_id": "support",
            "schema_sql": _get_schema("support"),
            "question_ru": ex["question_ru"],
            "sql": ex["sql"],
            "explanation_ru": ex["explanation_ru"],
            "assumptions": ex.get("assumptions", []),
            "difficulty": ex["difficulty"],
            "concepts": ex["concepts"],
            "split": "validation",
            "context": "",
        })
'''
    
    target_string = "# ── TEST: support database ONLY (separate schema for transfer) ──"
    if target_string in content and "support_train" not in content:
        content = content.replace(target_string, support_train + "\n    " + target_string)
        file_path.write_text(content)
        print("Patched build_seed_dataset.py successfully.")
    else:
        print("Failed to patch or already patched.")

if __name__ == "__main__":
    main()
