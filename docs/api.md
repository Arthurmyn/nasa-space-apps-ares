# API-контракт

Base URL: `http://localhost:8000/api/v1` · Интерактивная дока: `/docs` (Swagger).

Источник правды — Pydantic-схемы в [`backend/app/schemas/`](../backend/app/schemas/). Этот файл — человекочитаемая версия для фронта.

## `GET /health`
```json
{ "status": "ok", "model_loaded": true }
```

## `POST /predict`
Запрос:
```json
{ "features": { "x1": 1.0, "x2": 0.5 } }
```
Ответ `200`:
```json
{ "prediction": 1, "confidence": 0.87 }
```
Ошибки: `422` — невалидный ввод, `503` — модель не загружена.

> ⚠️ Формат `features` — заглушка. Заменить, когда определимся с задачей.

---

### Как менять контракт
1. Обнови схему в `backend/app/schemas/`.
2. Обнови этот файл и типы в `frontend/src/api/client.ts`.
3. Всё — в одном PR, отметь фронт и бэк ревьюерами.
