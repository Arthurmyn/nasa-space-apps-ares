#!/usr/bin/env bash
# Builds and publishes one commit. Called by deploy/ssh-deploy with the deploy lock held
# and /srv/ares/repo checked out at that commit.
#
# Layout on the server:
#   /srv/ares/.env              settings (not in git), see deploy/README.md
#   /srv/ares/repo/             checkout of the commit being deployed
#   /srv/ares/releases/<sha>/   built static files: landing/ and frontend/app/
#   /srv/ares/current           symlink to the live release (Caddy serves from it)
set -euo pipefail

SHA="$1"
ROOT=/srv/ares
REPO="$ROOT/repo"
RELEASE="$ROOT/releases/$SHA"
BUILD="$RELEASE.partial"
KEEP=3

cd "$ROOT"
rm -rf "$BUILD"
mkdir -p "$BUILD"

# $1 = app folder in the repo, $2 = its build output, $3 = destination inside the release
build_static() {
  echo "==> building $1"
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
    -v "$REPO:/repo" -w "/repo/$1" node:20-alpine \
    sh -c "npm ci --no-audit --no-fund --loglevel=error && npm run build"
  mkdir -p "$BUILD/$3"
  rsync -a --delete "$REPO/$1/$2/" "$BUILD/$3/"
}

build_static landing dist landing
build_static frontend dist/app frontend/app

rm -rf "$RELEASE"
mv "$BUILD" "$RELEASE"

echo "==> backend"
docker compose -p ares --project-directory "$ROOT" -f "$REPO/deploy/compose.yml" \
  up -d --build --remove-orphans --wait

# Switch the site to the new release in one step.
ln -sfn "releases/$SHA" "$ROOT/current.tmp"
mv -Tf "$ROOT/current.tmp" "$ROOT/current"
echo "==> live: $SHA"

# Keep the last few releases for a quick rollback.
ls -1dt "$ROOT"/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
docker image prune -f >/dev/null
