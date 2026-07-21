# PHASE 4A: Error Analysis (Baseline Qwen3-4B)

**Total Examples**: 14
**Exact Match**: 2/14
**Execution Match**: 7/14

## Error Taxonomy

| Category | Count |
|---|---|
| other | 6 |
| semantically equivalent but non-exact | 5 |
| date logic | 1 |

## Error Details

### support_test_051
**Question**: Сколько тикетов обработал каждый агент? Покажи имя и количество.
**Category**: other
**Expected**: `SELECT a.name, COUNT(t.id) AS ticket_count FROM agents a JOIN tickets t ON a.id = t.agent_id GROUP BY a.id, a.name;`
**Predicted**: `SELECT agents.name, COUNT(tickets.id) AS ticket_count FROM agents LEFT JOIN tickets ON agents.id = tickets.agent_id GROUP BY agents.name;`
**Reason**: Execution mismatch

### support_test_052
**Question**: Какие компании подали критические тикеты?
**Category**: semantically equivalent but non-exact
**Expected**: `SELECT DISTINCT c.company_name FROM clients c JOIN tickets t ON c.id = t.client_id WHERE t.priority = 'critical';`
**Predicted**: `SELECT DISTINCT clients.company_name FROM clients JOIN tickets ON clients.id = tickets.client_id WHERE tickets.priority = 'critical';`
**Reason**: Execution matches but exact SQL strings differ.

### support_test_053
**Question**: Покажи среднюю оценку удовлетворённости по каждой категории тикетов.
**Category**: semantically equivalent but non-exact
**Expected**: `SELECT category, AVG(satisfaction_score) AS avg_score FROM tickets WHERE satisfaction_score IS NOT NULL GROUP BY category;`
**Predicted**: `SELECT category, AVG(satisfaction_score) AS avg_satisfaction FROM tickets GROUP BY category;`
**Reason**: Execution matches but exact SQL strings differ.

### support_test_054
**Question**: Какие тикеты ещё не назначены ни одному агенту?
**Category**: other
**Expected**: `SELECT id, subject, status FROM tickets WHERE agent_id IS NULL;`
**Predicted**: `SELECT * FROM tickets WHERE agent_id IS NULL;`
**Reason**: Execution mismatch

### support_test_055
**Question**: Покажи клиентов с тарифом premium или enterprise, у которых есть тикеты.
**Category**: other
**Expected**: `SELECT DISTINCT c.company_name, c.plan FROM clients c JOIN tickets t ON c.id = t.client_id WHERE c.plan IN ('premium', 'enterprise');`
**Predicted**: `SELECT DISTINCT clients.id, clients.company_name
FROM clients
JOIN tickets ON clients.id = tickets.client_id
WHERE clients.plan IN ('premium', 'enterprise');`
**Reason**: Execution mismatch

### support_test_056
**Question**: Покажи топ-3 агентов по количеству решённых тикетов.
**Category**: other
**Expected**: `SELECT a.name, COUNT(t.id) AS resolved_count FROM agents a JOIN tickets t ON a.id = t.agent_id WHERE t.status = 'resolved' GROUP BY a.id, a.name ORDER BY resolved_count DESC LIMIT 3;`
**Predicted**: `SELECT agents.name, COUNT(tickets.id) AS resolved_tickets_count
FROM agents
LEFT JOIN tickets ON agents.id = tickets.agent_id
WHERE tickets.status = 'closed'
GROUP BY agents.name
ORDER BY resolved_tickets_count DESC
LIMIT 3;`
**Reason**: Execution mismatch

### support_test_057
**Question**: Сколько сообщений написано по каждому тикету?
**Category**: semantically equivalent but non-exact
**Expected**: `SELECT ticket_id, COUNT(*) AS msg_count FROM ticket_messages GROUP BY ticket_id;`
**Predicted**: `SELECT tickets.id, COUNT(*) AS message_count FROM tickets JOIN ticket_messages ON tickets.id = ticket_messages.ticket_id GROUP BY tickets.id;`
**Reason**: Execution matches but exact SQL strings differ.

### support_test_058
**Question**: Покажи тикеты с багами, решённые более чем за 1 день.
**Category**: date logic
**Expected**: `SELECT t.id, t.subject, t.created_at, t.resolved_at FROM tickets t WHERE t.category = 'bug' AND t.resolved_at IS NOT NULL AND julianday(t.resolved_at) - julianday(t.created_at) > 1;`
**Predicted**: `SELECT * FROM tickets WHERE category = 'bug' AND status = 'closed' AND resolved_at > DATE('now', ' -1 day')`
**Reason**: Execution mismatch

### support_test_059
**Question**: Покажи количество тикетов по приоритету, где тикетов больше двух.
**Category**: semantically equivalent but non-exact
**Expected**: `SELECT priority, COUNT(*) AS cnt FROM tickets GROUP BY priority HAVING COUNT(*) > 2;`
**Predicted**: `SELECT priority, COUNT(*) AS count FROM tickets GROUP BY priority HAVING COUNT(*) > 2;`
**Reason**: Execution matches but exact SQL strings differ.

### support_test_060
**Question**: Для каждого агента покажи количество тикетов и пометку: если больше 3 — «высокая нагрузка», иначе «нормальная».
**Category**: other
**Expected**: `SELECT a.name, COUNT(t.id) AS cnt, CASE WHEN COUNT(t.id) > 3 THEN 'высокая нагрузка' ELSE 'нормальная' END AS workload FROM agents a JOIN tickets t ON a.id = t.agent_id GROUP BY a.id, a.name;`
**Predicted**: `SELECT agents.name, COUNT(tickets.id) AS ticket_count, 
       CASE
           WHEN COUNT(tickets.id) > 3 THEN 'высокая нагрузка'
           ELSE 'нормальная'
       END AS load_status
FROM agents
LEFT JOIN tickets ON agents.id = tickets.agent_id
GROUP BY agents.id;`
**Reason**: Execution mismatch

### support_test_061
**Question**: Покажи среднее время решения тикетов (в днях) по командам агентов.
**Category**: other
**Expected**: `SELECT a.team, AVG(julianday(t.resolved_at) - julianday(t.created_at)) AS avg_days FROM agents a JOIN tickets t ON a.id = t.agent_id WHERE t.resolved_at IS NOT NULL GROUP BY a.team;`
**Predicted**: `SELECT agents.team, AVG(JULIANDAY('now', resolved_at) - JULIANDAY('now', created_at)) AS avg_resolution_days FROM tickets JOIN agents ON tickets.agent_id = agents.id WHERE tickets.status = 'resolved' GROUP BY agents.team;`
**Reason**: Execution mismatch

### support_test_062
**Question**: Есть ли клиенты без тикетов? Покажи название компании.
**Category**: semantically equivalent but non-exact
**Expected**: `SELECT c.company_name FROM clients c LEFT JOIN tickets t ON c.id = t.client_id WHERE t.id IS NULL;`
**Predicted**: `SELECT company_name FROM clients WHERE id NOT IN (SELECT client_id FROM tickets);`
**Reason**: Execution matches but exact SQL strings differ.

## Gaps to Address in Dataset
Based on this analysis, the new dataset should explicitly address:
1. **Date Logic (SQLite specific)**: Explicitly teach `julianday()` and date math differences in SQLite vs standard SQL.
2. **JOINs & LEFT JOINs**: The model tends to hallucinate subqueries or fail to appropriately `JOIN`/`LEFT JOIN` entities. It should practice joining 2-3 tables.
3. **Aggregations & HAVING**: Proper use of aliases in `GROUP BY` and `HAVING` clauses needs reinforcement.
4. **Formatting/Aliases**: Explicit instruction on when to use `a.column` versus `table_name.column` (aliases) for cleaner query structures.
