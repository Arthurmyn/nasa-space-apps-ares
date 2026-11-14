# Доска задач (GitHub Projects)

## Колонки (поле Status)

| Колонка | Когда карточка здесь |
|---------|---------------------|
| **Backlog** | Идея/задача записана, не взята в работу |
| **To Do** | Взята в текущий спринт/этап хакатона |
| **In Progress** | Есть исполнитель и ветка |
| **Review** | Открыт PR |
| **Done** | PR смержен в `main` |

Автоматизации (включить в *Project → ⋯ → Workflows*):
- *Item added to project* → Status = Backlog
- *Pull request merged* / *Item closed* → Status = Done
- *Auto-add to project*: фильтр `is:issue,pr repo:Arthurmyn/nasa-space-apps-ares`

## Лейблы

| Группа | Лейблы |
|--------|--------|
| Область | `area:frontend`, `area:backend`, `area:ml`, `area:infra`, `area:docs` |
| Тип | `type:feature`, `type:bug`, `type:task` |
| Приоритет | `priority:P0`, `priority:P1`, `priority:P2` |
| Прочее | `blocked`, `good first issue` |

Создаются скриптом [`scripts/setup-github.sh`](../scripts/setup-github.sh).

## Этапы хакатона (Milestones)

| Milestone | Цель |
|-----------|------|
| `M0: Foundation` | Репо, структура, сборка, контракт API, baseline-модель |
| `M1: MVP` | Сквозной сценарий фронт → бэк → модель работает |
| `M2: Polish` | UI, качество модели, обработка ошибок |
| `M3: Demo` | Деплой, презентация, видео, README для жюри |

## Ритм
- Стендап каждые ~4 часа: что сделал / что делаю / что блокирует.
- P0-задачи без исполнителя дольше 30 минут - сигнал тимлиду.
