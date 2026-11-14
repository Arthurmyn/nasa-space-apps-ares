# Как работать в проекте

Хакатон = мало времени. Правила минимальны, но экономят часы на мерж-конфликтах.

## 1. Ветки (Branching Strategy)

Упрощённый Git Flow:

```
main ──●────────────────●───────────────●──▶   стабильно, всегда демо-готово
        \              /               /
dev ─────●──●──●──●───●──●──●──●──●───●──▶     интеграция, сюда мержим фичи
             \    /         \    /
feature/...   ●──●           ●──●              одна задача = одна ветка
```

| Ветка | Назначение | Кто мержит |
|-------|-----------|------------|
| `main` | Рабочая версия для демо/жюри. Напрямую не пушим. | Тимлид, из `dev` |
| `dev` | Интеграционная ветка. Все фичи сначала сюда. | PR + 1 approve |
| `feature/<область>-<кратко>` | Новая функциональность | Автор → PR в `dev` |
| `fix/<область>-<кратко>` | Исправление бага | Автор → PR в `dev` |
| `hotfix/<кратко>` | Срочный фикс прямо перед демо | PR в `main`, затем в `dev` |
| `docs/…`, `chore/…` | Документация, конфиги | PR в `dev` |

Области: `fe`, `be`, `ml`, `infra`. Примеры: `feature/fe-upload-page`, `fix/be-cors`, `feature/ml-baseline`.

```bash
git checkout dev && git pull
git checkout -b feature/be-predict-endpoint
# ... работа ...
git pull --rebase origin dev        # подтянуть свежий dev перед PR
git push -u origin feature/be-predict-endpoint
# открыть PR в dev
```

## 2. Коммиты

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(be): add /predict endpoint
fix(fe): handle empty API response
feat(ml): train baseline logistic regression
docs: update README quick start
chore(infra): add docker-compose
```

Типы: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`. Scope: `fe`, `be`, `ml`, `infra`.

## 3. Pull Requests

- Один PR — одна задача, желательно < 400 строк.
- В описании — ссылка на issue: `Closes #12` (карточка на доске закроется сама).
- Заполни шаблон PR (подставляется автоматически).
- Минимум **1 approve** перед мержем в `dev`.
- Мерж — **Squash and merge**.
- `dev → main` — только тимлид, перед чекпоинтами и демо.

## 4. Задачи (Issues + доска)

- Любая работа начинается с issue (шаблоны: Feature / Bug / Task).
- Назначь себя, поставь лейблы `area:*` и `priority:*`.
- Двигай карточку: `Backlog → To Do → In Progress → Review → Done`.
- Подробнее — [docs/project-board.md](docs/project-board.md).

## 5. Контракт API

Фронт и бэк договариваются **заранее** через [docs/api.md](docs/api.md) и Pydantic-схемы в `backend/app/schemas/`. Меняешь контракт — обнови доку и предупреди в чате. Пока бэк не готов, фронт работает на моках.

## 6. Код-стайл

| Где | Инструмент |
|-----|-----------|
| Python (backend, ml) | `ruff check .` + `ruff format .`, type hints |
| TypeScript (frontend) | `npm run lint`, strict `tsconfig` |
| Везде | `.editorconfig`, LF |

## 7. Что НЕ коммитим

- `.env`, ключи, токены → только `.env.example`
- датасеты (`ml/data/`) и веса (`ml/models/`) → в облако/Drive, ссылку — в [ml/README.md](ml/README.md)
- `node_modules/`, `.venv/`, `__pycache__/`

## 8. Definition of Done

- [ ] Код в `dev` через PR с ревью
- [ ] Запускается по инструкции из README
- [ ] CI зелёный
- [ ] Если менялся API — обновлён `docs/api.md`
