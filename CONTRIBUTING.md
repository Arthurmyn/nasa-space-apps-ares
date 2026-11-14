# How we work in this project

A hackathon means little time. The rules are minimal, but they save hours of merge conflicts.

## 1. Branches (Branching Strategy)

One task, one branch. Changes are merged into `main` through a PR.

| Branch | Purpose | Who merges |
|--------|---------|------------|
| `main` | Working version for the demo and the judges. We do not push to it directly. | PR + 1 approval |
| `feature/<area>-<short>` | New functionality | Author → PR into `main` |
| `fix/<area>-<short>` | Bug fix | Author → PR into `main` |
| `hotfix/<short>` | Urgent fix right before the demo | PR into `main` |
| `docs/…`, `chore/…` | Documentation, configs | PR into `main` |

Areas: `fe`, `be`, `ml`, `infra`. Examples: `feature/fe-upload-page`, `fix/be-cors`, `feature/ml-baseline`.

```bash
git checkout main && git pull
git checkout -b feature/be-predict-endpoint
# ... work ...
git pull --rebase origin main       # pull the latest main before the PR
git push -u origin feature/be-predict-endpoint
# open a PR into main
```

## 2. Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(be): add /predict endpoint
fix(fe): handle empty API response
feat(ml): train baseline logistic regression
docs: update README quick start
chore(infra): add docker-compose
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`. Scope: `fe`, `be`, `ml`, `infra`.

## 3. Pull Requests

- One PR, one task, preferably under 400 lines.
- Link the issue in the description: `Closes #12` (the board card closes by itself).
- Fill in the PR template (it is added automatically).
- At least **1 approval** before merging into `main`.
- Merge with **Squash and merge**.

## 4. Tasks (issues and board)

- Any work starts with an issue (templates: Feature / Bug / Task).
- Assign yourself and add the `area:*` and `priority:*` labels.
- Move the card: `Backlog → To Do → In Progress → Review → Done`.
- More in [docs/project-board.md](docs/project-board.md).

### How to write an issue

Before you start, create an issue from the matching template: **Feature** for a new capability, **Bug** for an error, **Task** for a technical or organizational task.

In the issue, state:

- **Goal and context:** which problem we solve and why it is needed; attach links to the materials in `docs/context/`, if there are any.
- **Result:** what exactly must appear or change; set the boundaries of the task.
- **Subtasks:** a checklist of the concrete steps needed for the result.
- **Definition of done:** checkable conditions for accepting the work. For example: "when an empty file is submitted, the user sees an error message".
- **Dependencies:** links to related issues and to what must be obtained before work starts.

The title must describe a concrete action and result: "Add a format check for uploaded files" instead of "Do the front end".

### How to split a big task

One issue, one clear result that can be checked and accepted on its own. If parts of the work have different assignees, or can be done and accepted independently, create separate issues for them. Keep small steps of a single assignee as a checklist inside the issue.

For a big task, create a parent issue with the overall goal and links to the child tasks. In each child, state the link to the parent and the dependencies on other tasks.

For example, "Add file upload and result display" can be split into:

- Backend: accept the file, check the format and return the result.
- Frontend: add an upload form and show the result or an error.
- Integration: check the full upload scenario once the frontend and backend are ready.

Before implementation starts, assign an owner, add the `area:*` and `priority:*` labels, and agree on the result and the definition of done. Add `Closes #<issue number>` to the PR; close a parent task when all its child tasks are done and the overall result is checked.

## 5. API contract

Frontend and backend agree **in advance** through [docs/api.md](docs/api.md) and the Pydantic schemas in `backend/app/schemas/`. If you change the contract, update the docs and tell the team in the chat. Until the backend is ready, the frontend works on mocks.

## 6. Code style

| Where | Tool |
|-------|------|
| Python (backend, ml) | `ruff check .` + `ruff format .`, type hints |
| TypeScript (frontend) | `npm run lint`, strict `tsconfig` |
| Everywhere | `.editorconfig`, LF |

## 7. What we do NOT commit

- `.env`, keys, tokens → only `.env.example`
- datasets (`ml/data/`) and weights (`ml/models/`) → to the cloud/Drive, with the link in [ml/README.md](ml/README.md)
- `node_modules/`, `.venv/`, `__pycache__/`

## 8. Definition of Done

- [ ] Code is in `main` through a reviewed PR
- [ ] It runs by the instructions in the README
- [ ] Local linters and tests pass
- [ ] If the API changed, `docs/api.md` is updated
