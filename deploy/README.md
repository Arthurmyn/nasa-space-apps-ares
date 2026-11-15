# Deployment

The site runs on one VPS (Ubuntu, Oracle Cloud). Deploys are manual: a push never deploys on its
own. Deploy a commit in one of two ways:

- GitHub: Actions -> Deploy -> Run workflow, on `main` (`.github/workflows/deploy.yml`).
- SSH, as `deploy` on the server: `/srv/ares/bin/ssh-deploy <full commit sha>`.

| Path | What it serves |
|---|---|
| `/` | landing (`landing/`) |
| `/app/` | planner (`frontend/`) |
| `/api/*` | backend (`backend/`, FastAPI in Docker) |

The site used to be on Vercel. The root `vercel.json` now only turns off Vercel deploys from Git;
delete it once the Vercel projects are disconnected from the repository.

## How a deploy works

1. The workflow (or you, over SSH) connects as `deploy` with a key that may only run `ssh-deploy <commit sha>`.
2. `ssh-deploy` takes a lock, fetches that commit into `/srv/ares/repo` and runs `deploy.sh`.
3. `deploy.sh` builds `landing/` and `frontend/` in a `node:20-alpine` container into
   `/srv/ares/releases/<sha>/`, rebuilds the backend with `compose.yml` and waits until it is healthy.
4. Only then `/srv/ares/current` is switched to the new release. Caddy serves from `current`.
5. The workflow checks `$SITE_URL/api/v1/health`.

One deploy at a time: a second run waits for the first, and the server lock makes a deploy wait
if another one is still finishing. A failed or cancelled deploy leaves the
previous release live. The last 3 releases are kept.

## Server layout

```
/srv/ares/
  .env              settings, see env.example (not in git)
  bin/ssh-deploy    copy of deploy/ssh-deploy
  repo/             checkout of the deployed commit
  releases/<sha>/   built static files
  current           -> releases/<sha>
/etc/caddy/Caddyfile                      copy of deploy/Caddyfile
/etc/systemd/system/caddy.service.d/env.conf   EnvironmentFile=/srv/ares/.env
```

`deploy.sh` and `compose.yml` are used straight from the deployed commit, so changes to them ship
with a normal PR. `ssh-deploy` and `Caddyfile` are installed by hand (see below).

## GitHub settings

Settings -> Secrets and variables -> Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `VPS_HOST` | server IP |
| Secret | `VPS_SSH_KEY` | private key of the deploy key (the one pinned to `ssh-deploy`) |
| Secret | `VPS_KNOWN_HOSTS` | `<ip> ssh-ed25519 AAAA...` from `ssh-keyscan -t ed25519 <ip>` |
| Variable | `SITE_URL` | `https://<domain>`, or `http://<ip>` before the domain is set |

## Domain

1. Add a DNS `A` record for the domain pointing to the server IP. With Cloudflare, turn the proxy off.
2. Make sure the Oracle Cloud security list allows TCP 80 and 443.
3. On the server, in `/srv/ares/.env`: set `DOMAIN=<domain>` and `CORS_ORIGINS=https://<domain>`.
4. `sudo systemctl restart caddy`, then redeploy (Actions -> Deploy -> Run workflow) so the backend
   picks up the new `CORS_ORIGINS`.
5. Change the `SITE_URL` variable to `https://<domain>`.

For both `example.com` and `www.example.com`, set `DOMAIN=example.com, www.example.com`.

## Manual operations

Deploy a commit by hand:

```bash
ssh deploy@<ip> /srv/ares/bin/ssh-deploy <full commit sha>
```

Roll back to a previous release (static files only; redeploy the commit to roll back the backend too):

```bash
ls -t /srv/ares/releases
ln -sfn releases/<sha> /srv/ares/current
```

Update `ssh-deploy` or the Caddyfile after changing them in the repo:

```bash
install -m 755 /srv/ares/repo/deploy/ssh-deploy /srv/ares/bin/ssh-deploy
sudo install -m 644 /srv/ares/repo/deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Logs:

```bash
docker logs ares-backend-1
sudo tail -f /var/log/caddy/access.log
```

## Server setup (already done)

- User `deploy`: key login only, no sudo, in the `docker` group.
- SSH: no root login, no passwords, `AllowUsers ubuntu deploy opc` (`opc` is used by Oracle tooling).
- Firewall: Oracle iptables rules plus 80/443; fail2ban for SSH.
- Unattended security upgrades with a reboot at 04:00 UTC when needed.
- 2 GB swap (the VM has 1 GB RAM).
