#!/usr/bin/env bash
# One-time GitHub repository setup: labels, milestones, board, branch protection.
# Requires: the gh CLI, authorized with repo + project rights (gh auth refresh -s project).
# Run: bash scripts/setup-github.sh
set -euo pipefail

REPO="${REPO:-Arthurmyn/nasa-space-apps-ares}"
OWNER="${REPO%%/*}"

echo "==> Labels"
label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force; }
label "area:frontend" "1d76db" "Frontend"
label "area:backend"  "5319e7" "Backend"
label "area:ml"       "0e8a16" "Machine learning"
label "area:infra"    "6a737d" "Docker, deploy"
label "area:docs"     "c5def5" "Documentation"
label "type:feature"  "a2eeef" "New functionality"
label "type:bug"      "d73a4a" "Something is broken"
label "type:task"     "fef2c0" "Technical task"
label "priority:P0"   "b60205" "Blocks demo"
label "priority:P1"   "d93f0b" "Needed for MVP"
label "priority:P2"   "fbca04" "Nice to have"
label "blocked"       "000000" "Waiting on something"

echo "==> Milestones"
for m in "M0: Foundation" "M1: MVP" "M2: Polish" "M3: Demo"; do
  gh api "repos/$REPO/milestones" -f title="$m" >/dev/null 2>&1 && echo "  + $m" || echo "  = $m (exists)"
done

echo "==> Project board"
PROJECT_NUM=$(gh project create --owner "$OWNER" --title "Ares Hackathon" --format json --jq '.number')
gh project link "$PROJECT_NUM" --owner "$OWNER" --repo "$REPO"
echo "  Project #$PROJECT_NUM created and linked."
echo "  Add the columns Backlog/To Do/In Progress/Review/Done to the Status field and turn on Workflows (see docs/project-board.md)."

echo "==> Branch protection (main)"
for b in main; do
  gh api -X PUT "repos/$REPO/branches/$b/protection" --input - <<JSON || echo "  ! could not protect $b (the branch needs a push / a paid plan for private repos)"
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
done

gh repo edit "$REPO" --default-branch main --enable-squash-merge --delete-branch-on-merge
echo "Done."
