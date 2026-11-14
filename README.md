# NASA Space Apps - ARES

> Хакатон-проект. **Одна фраза о том, что мы делаем и для кого** - заполнить, когда утвердим идею.

> **Перед началом любой работы прочитай [docs/context/](docs/context/)** - там лежат материалы и контекст по задачам проекта.
> Это единый источник правды. Если контекст расходится с кодом или чатом - уточни у команды.

## Проблема
_Какую боль решаем? Кто пользователь?_

## Решение
_Что делает продукт? Ключевые фичи (3–5 пунктов)._

## Архитектура

```
┌────────────┐   HTTP/JSON   ┌────────────┐   python import   ┌────────────┐
│  frontend  │ ────────────▶ │  backend   │ ────────────────▶ │     ml     │
│ React+Vite │               │  FastAPI   │                   │ train/infer│
└────────────┘               └────────────┘                   └────────────┘
     :5173                        :8000                      ml/models/*.pkl
```

| Слой | Стек | Папка |
|------|------|-------|
| Frontend | React 18, TypeScript, Vite | [`frontend/`](frontend/) |
| Backend | Python 3.11, FastAPI, Pydantic | [`backend/`](backend/) |
| ML | Python, scikit-learn (→ PyTorch при необходимости), Jupyter | [`ml/`](ml/) |
| Infra | Docker Compose, шаблоны GitHub | [`docker-compose.yml`](docker-compose.yml), [`.github/`](.github/) |

Подробнее - [docs/architecture.md](docs/architecture.md), контракт API - [docs/api.md](docs/api.md).

## Структура проекта

```
nasa-space-apps-ares/
├── .github/                # шаблоны PR/issue
├── docs/                   # архитектура, API-контракт, доска задач
├── frontend/               # клиент (React + Vite + TS)
│   └── src/api/            # клиент к backend
├── backend/                # API (FastAPI)
│   ├── app/api/routes/     # эндпоинты
│   ├── app/core/           # конфиг
│   ├── app/schemas/        # Pydantic-модели (контракт API)
│   ├── app/services/       # бизнес-логика, обёртка над ML
│   └── tests/
├── ml/                     # данные, ноутбуки, обучение, инференс
│   ├── data/{raw,processed}/   # не коммитим
│   ├── models/                 # артефакты моделей (не коммитим)
│   ├── notebooks/              # EDA и эксперименты
│   └── src/                    # train.py, inference.py
├── scripts/                # утилиты (настройка GitHub)
└── docker-compose.yml
```

## Быстрый старт

### Через Docker
```bash
cp .env.example .env
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend: http://localhost:8000 · Swagger: http://localhost:8000/docs

### Локально

**ML** (сначала - чтобы у бэка была модель)
```bash
cd ml
pip install -r requirements.txt
cd .. && python -m ml.src.train      # сохранит ml/models/model.pkl
```

**Backend**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate               # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt -r ../ml/requirements.txt
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

## Команда

| Имя | Роль | GitHub |
|-----|------|--------|
| Aikyn Sagyntai | Team lead | [@mathalama](https://github.com/mathalama) |
| … | Frontend | |
| … | Backend | |
| … | ML | |

## Как контрибьютить

Любая работа начинается с **GitHub Issue**: опиши цель, ожидаемый результат, подзадачи и критерии готовности. Большую задачу раздели на отдельные issues с проверяемым результатом и укажи зависимости между ними.

См. [правила оформления и разделения задач](CONTRIBUTING.md#4-задачи-issues--доска), а также [CONTRIBUTING.md](CONTRIBUTING.md): ветки, коммиты, PR, ревью.

## Лицензия
[Apache License 2.0](LICENSE)
