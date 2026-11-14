# Task board (GitHub Projects)

## Columns (the Status field)

| Column | When a card is here |
|--------|---------------------|
| **Backlog** | The idea or task is written down, not taken on |
| **To Do** | Taken into the current sprint or hackathon stage |
| **In Progress** | Has an owner and a branch |
| **Review** | A PR is open |
| **Done** | The PR is merged into `main` |

Automations (turn on in *Project → ⋯ → Workflows*):
- *Item added to project* → Status = Backlog
- *Pull request merged* / *Item closed* → Status = Done
- *Auto-add to project*: filter `is:issue,pr repo:Arthurmyn/nasa-space-apps-ares`

## Labels

| Group | Labels |
|-------|--------|
| Area | `area:frontend`, `area:backend`, `area:ml`, `area:infra`, `area:docs` |
| Type | `type:feature`, `type:bug`, `type:task` |
| Priority | `priority:P0`, `priority:P1`, `priority:P2` |
| Other | `blocked`, `good first issue` |

They are created by the script [`scripts/setup-github.sh`](../scripts/setup-github.sh).

## Hackathon stages (Milestones)

| Milestone | Goal |
|-----------|------|
| `M0: Foundation` | Repo, structure, build, API contract, baseline model |
| `M1: MVP` | The end-to-end scenario frontend → backend → model works |
| `M2: Polish` | UI, model quality, error handling |
| `M3: Demo` | Deployment, presentation, video, README for the judges |

## Rhythm
- Stand-up every ~4 hours: what I did / what I am doing / what blocks me.
- A P0 task without an owner for more than 30 minutes is a signal to the team lead.
