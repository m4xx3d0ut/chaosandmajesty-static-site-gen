# Production Deployment Playbook

A reference for promoting Chaos & Majesty builds into production via a `prod` branch, a Docker-based GitHub Action, and an SSH-accessible VPS that currently serves `/var/www` behind Nginx.

## Goals & Constraints
- Keep the existing VPS and Nginx footprint while introducing a containerized site service.
- Automate builds from the repository so production only ever serves committed assets.
- Avoid storing secrets in the repo; rely on CI/CD secrets and the VPS keyring.
- Support quick rollbacks and minimal downtime when promoting new releases.

## Implementation Snapshot
- Docker image now builds via a multi-stage `Dockerfile`, compiling the static bundle inside the build context before handing it to `nginxinc/nginx-unprivileged`.
- Ansible playbook (`ansible/deploy.yml`) provisions `/opt/chaosandmajesty`, templates the Compose project, pulls the tagged image, and verifies health over `http://127.0.0.1:80/health`.
- `.gitea/workflows/prod-deploy.yml` runs on every `prod` push, performing a smoke build, pushing the `prod`/`prod-<sha>` tags, and invoking the Ansible deploy through the CI runner.
- Subdomain reverse-proxying is no longer automatic; extend `nginx/default.conf`
  if you need additional upstreams beyond the primary site + WebDAV share.

## Branching & Promotion Flow
1. Continue feature development on short-lived branches; merge to `main` after review.
2. Cut release candidates from `main` into `prod` via a fast-forward merge (no direct commits on `prod`).
3. Protect `prod` with branch rules (status checks, linear history) so only the GitHub Action can deploy.
4. Tag deployments (e.g., `prod-2024-07-01`) to map VPS state to repository history.

> For the full bring-up procedure (stopping host nginx, mounting Let's Encrypt,
> and running the first playbook), see `docs/prod-first-run.md`.

## CI/CD Overview
On every push to `prod`, a dedicated GitHub Action should:
1. Check out the repo with full history for tag support.
2. Set up Node 18, install dependencies, and run `./build-site.sh` to regenerate `site-output/`.
3. Run smoke tests (today `./build-site.sh` already validates HTML; expand when unit tests exist).
4. Build a production Docker image using the root `Dockerfile` (which expects a pre-populated `site-output/`).
5. Tag and push the image to a registry (GitHub Container Registry is the path of least resistance).
6. Connect to the VPS over SSH, pull the new image, and restart the container via Docker Compose or `docker run`.
7. Post deployment status, including the image digest and the `./build-site.sh` output, to the workflow summary.

### GitHub Action Skeleton
```yaml
name: Deploy prod

on:
  push:
    branches: [prod]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: ./prepare-cm-files.sh
      - run: ./build-site.sh
      - name: Build and push image
        uses: docker/build-push-action@v5
        with:
          context: .
          tags: ghcr.io/chaosandmajesty/site:${{ github.sha }}
          push: true
      - name: Tag latest prod
        run: |
          docker buildx imagetools create \
            ghcr.io/chaosandmajesty/site:${{ github.sha }} \
            --tag ghcr.io/chaosandmajesty/site:prod
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: /opt/chaosandmajesty/bin/deploy.sh ghcr.io/chaosandmajesty/site:prod
```

> Swap in your namespace, and tighten permissions/secrets before enabling prod.

## Container Image Strategy
- The current `Dockerfile` expects `site-output/` to exist; ensure the Action runs `./build-site.sh` before `docker build` so the static bundle is in place.
- Stick with the unprivileged Nginx base image; it listens on 8080 internally, which plays well with an upstream Nginx reverse proxy on the host. Mount `/var/www/html/dav` into `/usr/share/nginx/html/dav` when deploying so WebDAV remains on the host filesystem.
- Use image labels (`org.opencontainers.image.*`) for traceability; they surface in GHCR UI and `docker inspect`.
- Consider a second build stage (FROM node:18-alpine) to compile `site-output/` inside the Docker build for reproducibility. If you switch to that, `docker build` no longer depends on CI running `./build-site.sh` first.

## Registry & Secrets Checklist
- `CR_PAT`: a GitHub personal access token or GitHub Actions OIDC with `packages:write` to push to GHCR.
- `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`: credentials for SSH access. Use a deploy-only user on the server.
- `CI_KNOWN_HOSTS`: pinned `ssh-ed25519`/`rsa` host key lines for `gitea-ssh.git-local.svc.cluster.local:2222` (capture once with `ssh-keyscan -p 2222`, verify, and paste the line verbatim).
- `KNOWN_HOSTS`: pinned line for the public VPS (`ssh-keyscan -H chaosandmajesty.com`). The deployment job refuses to trust first-use fingerprints now.
- Optional `NGINX_RELOAD_CMD` secret (e.g., `sudo systemctl reload nginx`) if you want the Action to refresh Nginx after updating upstreams.
- Store environment-specific toggles (e.g., basic auth) as Action secrets; never commit them to `smoke-test.yaml`.

## VPS Preparation
1. Install Docker Engine + Compose plugin (`apt-get install docker-ce docker-compose-plugin`).
2. Create a non-root `deploy` user, add to the `docker` group, and secure SSH access with the CI public key.
3. Lay down a runtime directory, e.g., `/opt/chaosandmajesty/`, containing:
   - `docker-compose.prod.yml`
   - `nginx/default.conf` (for reference)
   - `bin/deploy.sh` – a script that pulls the image, runs `docker compose up -d`, prunes old images, and emits a health check.
4. Keep `/var/www` as the Nginx document root but proxy traffic into the container.
5. Ensure outbound traffic from the VPS can reach GHCR (`docker login ghcr.io`).

### Example `docker-compose.prod.yml`
```yaml
services:
  site:
    image: ghcr.io/chaosandmajesty/site:prod
    container_name: cm-prod
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### Example `/opt/chaosandmajesty/bin/deploy.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail
IMAGE_NAME=${1:?"Usage: deploy.sh <image>"}

/usr/bin/docker login ghcr.io -u chaosandmajesty -p "$CR_PAT"
/usr/bin/docker compose -f /opt/chaosandmajesty/docker-compose.prod.yml pull
/usr/bin/docker compose -f /opt/chaosandmajesty/docker-compose.prod.yml up -d
/usr/bin/docker image prune -f --filter label=chaosandmajesty.prod=true
/usr/bin/curl --fail http://127.0.0.1:80/health
```
Add execution permissions (`chmod +x`). Inject the token via an environment file or SSH agent forwarding; avoid hard-coding secrets.

## Nginx Integration on the VPS
- Keep `/etc/nginx/sites-available/default` (or your site block) as the public entry point.
- Proxy to the container listening on localhost:8080:
  ```nginx
  server {
      listen 80;
      server_name chaosandmajesty.com;

      location / {
          proxy_pass http://127.0.0.1:8080;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  ```
- Reload Nginx after the first successful container start: `sudo systemctl reload nginx`.
- Keep TLS termination on the host (e.g., Certbot) so certificate renewals remain unchanged.

## Deployment Options

### Option A – GitHub Action + SSH (recommended)
- **Flow:** Action builds/pushes the image, uses `appleboy/ssh-action` (or `rschwoebel/ssh-exec`) to run the deploy script.
- **Pros:** No additional infrastructure, auditable; reuse Compose health checks, easy rollback via `docker compose up -d IMAGE=previous-tag`.
- **Cons:** Requires SSH key distribution; CI must reach the VPS.

### Option B – Self-hosted Runner on the VPS
- **Flow:** Install a GitHub Actions runner on the VPS. The workflow builds the image locally and runs `docker compose up -d` without SSH.
- **Pros:** Avoids SSH keys; large artifacts never leave the server.
- **Cons:** Runner downtime blocks deploys; runner needs system updates and isolation to avoid interfering with the live container.

### Option C – Pull-Based Deployment (Watchtower or Cron)
- **Flow:** CI pushes the image and tags `prod`. The VPS runs Watchtower or a cron job (`docker compose pull && docker compose up -d`) that polls GHCR.
- **Pros:** Decouples release initiation from CI connectivity; easier blue/green experiments.
- **Cons:** Adds latency between `git push` and release; relies on server-side automation you must monitor.

## Rollback Plan
1. List images: `docker images ghcr.io/chaosandmajesty/site`.
2. Re-run the deploy script with a prior tag (e.g., `prod-2024-07-01`).
3. If the container fails health checks, `docker compose logs -f` and keep the previous container running (`docker compose up` keeps the last healthy container until the new one passes).
4. As a last resort, revert the Nginx proxy to serve the legacy `/var/www` build while triaging the container.

## Operational Tips
- Run `./build-site.sh` locally before tagging a release; stash the output for PR reviewers.
- Set up uptime monitoring against `https://chaosandmajesty.com/health` (proxying to container `/health`).
- Rotate SSH keys and GHCR tokens quarterly; document expiration dates alongside the secrets in 1Password or Vault.
- Capture the workflow URL and container digest in release notes for traceability.

With these pieces in place, the `prod` branch becomes the single source of truth for what runs in production, while the VPS keeps its existing networking footprint.
