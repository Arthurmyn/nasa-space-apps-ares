# Как работать в проекте

Хакатон = мало времени. Правила минимальны, но экономят часы на мерж-конфликтах.

## 1. Ветки (Branching Strategy)

Одна задача — одна ветка. Изменения мержим через PR в `main`.

| Ветка | Назначение | Кто мержит |
|-------|-----------|------------|
| `main` | Рабочая версия для демо/жюри. Напрямую не пушим. | PR + 1 approve |
| `feature/<область>-<кратко>` | Новая функциональность | Автор → PR в `main` |
| `fix/<область>-<кратко>` | Исправление бага | Автор → PR в `main` |
| `hotfix/<кратко>` | Срочный фикс прямо перед демо | PR в `main` |
| `docs/…`, `chore/…` | Документация, конфиги | PR в `main` |

Области: `fe`, `be`, `ml`, `infra`. Примеры: `feature/fe-upload-page`, `fix/be-cors`, `feature/ml-baseline`.

```bash
git checkout main && git pull
git checkout -b feature/be-predict-endpoint
# ... работа ...
git pull --rebase origin main       # подтянуть свежий main перед PR
git push -u origin feature/be-predict-endpoint
# открыть PR в main
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
- Минимум **1 approve** перед мержем в `main`.
- Мерж — **Squash and merge**.

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

- [ ] Код в `main` через PR с ревью
- [ ] Запускается по инструкции из README
- [ ] Локальные линтеры и тесты проходят
- [ ] Если менялся API — обновлён `docs/api.md`
