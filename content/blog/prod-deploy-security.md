---
title: "Prod Deploy Hardening — GitHub Actions to Rootless Nginx"
slug: prod-deploy-security
author: m4xx3d0ut
summary: A deep dive into how our prod workflow keeps the supply chain tight, from SSH-pinned GitHub Actions jobs to the rootless Nginx container that serves the finished site.
publishedAt: '2025-10-23'
updatedAt: '2025-10-23'
readingMinutes: 12
tags:
- security
- devops
- platform
---
## TLDR;

The prod deployment line uses SSH deploy keys with pinned host fingerprints, build-time git mirror sync, registry scoping, and an Ansible play that pushes a rootless Nginx image with hardened filesystem mounts. Secrets stay in GitHub and SOPS ciphertext, while the runtime container drops root, locks permissions, and exposes only the static bundle and WebDAV mount it needs to keep legacy clients alive.

> **2025-10-23 update:** Post-deploy we added an Ansible include that rehydrates `/etc/letsencrypt` ownership for UID/GID 101 and pre-creates `/run/nginx` inside the image build. That keeps the rootless base image happy while preserving the same privilege drop that worked in the last known-good release.

## Build Pipeline Controls

1. **SSH-only source fetch.** The prod workflow (`.github/workflows/prod-deploy.yml`) refuses to run without the CI deploy key and known hosts. The job seeds `~/.ssh/config` with a single host alias and runs `ssh-keygen -E sha256` so we can audit key fingerprints directly in the log.
2. **Git mirror hydration.** `./build-site.sh` reads `config/git/manifest.txt`, pulls each listed branch with depth caps, then exports bare HTTP clones. The site ships its own `/git/*` mirrors, meaning prod never shells out to upstream staging services at runtime.
3. **Node and Docker hygiene.** The builder runs on the GitHub-hosted Ubuntu image with `npm ci` for reproducible dependency trees. Docker build args include a `SYNC_GIT_MANIFEST_URL_REWRITE` so private lab remotes map cleanly into the build container without leaking internal hostnames.
4. **Registry scoping.** The workflow normalises `REGISTRY_HOST`, warns if someone points at the MicroK8s lab registry, and pushes two tags (`prod` and `prod-$short_sha`). The login step uses GitHub’s ephemeral secrets, so no static credentials land in the repo.
5. **Ansible with custom CA bundle.** Before touching the VPS the deploy job builds a CA bundle that layers the runner’s `SSL_CERT_FILE` over `/etc/ssl/certs`. That keeps TLS validation intact even if GitHub’s runners hand us a custom root for private indices.

```yaml
- name: Prepare SSH for Gitea
  env:
    CI_DEPLOY_KEY: ${{ secrets.CI_DEPLOY_KEY }}
    CI_KNOWN_HOSTS: ${{ env.CI_KNOWN_HOSTS }}
  run: |
    install -m 700 -d ~/.ssh
    printf "%s\n" "${CI_DEPLOY_KEY}" > ~/.ssh/id_ci
    chmod 600 ~/.ssh/id_ci
    if [ -n "${CI_KNOWN_HOSTS}" ]; then
      printf "%s\n" "${CI_KNOWN_HOSTS}" > ~/.ssh/known_hosts
    else
      ssh-keyscan -p 2222 gitea-ssh.git-local.svc.cluster.local > ~/.ssh/known_hosts
    fi
```

## Deploy Playbook Coverage

- **Inventory isolation.** `ansible/inventory/hosts.ini` only pins the prod hostname and deploy user. Credentials ride in GitHub secrets (`VPS_HOST`, `VPS_USER`, `SSH_PRIVATE_KEY`), not in source.
- **Permission bootstrapping.** The `app_deploy` role now includes a dedicated `letsencrypt.yml` task file that sets up fixed GID 101, ensures `/etc/letsencrypt` *and* its `archive/` tree inherit that group, and records the deployed image digest in `/opt/chaosandmajesty/.current-image`.
- **Controlled registry pulls.** `community.docker.docker_image` pulls `image_ref` with `force_source: true`, ensuring the compose project always runs what the pipeline built—even if the tag already exists locally.
- **Health-gated rollout.** After `docker compose up`, the playbook polls `http://127.0.0.1:8080/health` before it considers the run successful, catching regressions before the workflow reports green.

## Rootless Nginx Runtime

1. **User namespace.** The runtime image inherits from `nginxinc/nginx-unprivileged:alpine`, creates UID/GID 101, and keeps the master/worker processes under that account by default. We now bake `/run/nginx` into the image so the pid file can still be written without escalating.
2. **Minimal filesystem exposure.** Only `/usr/share/nginx/html`, `/etc/nginx/http.d/default.conf`, the optional WebDAV share, and Let’s Encrypt paths are mounted. Logs and cache directories are created with 101 ownership so no root escalation is needed at runtime.
3. **Dynamic module build.** A scratch stage compiles the dav_ext module against Nginx’s configure flags, keeping WebDAV support without shipping build toolchains in the final image.
4. **Healthcheck baked in.** `HEALTHCHECK` inside the Dockerfile mirrors the Ansible probe so both container runtime and deployment job agree on liveness criteria.
5. **Registry provenance.** OCI labels include the internal Gitea URL, making it easy to trace an image in GHCR back to the commit and workflow that produced it.

```dockerfile
RUN set -eux; \
    install -d /run/nginx; \
    chown 101:101 /run/nginx
```

## Keeping Secrets Secret

- **SOPS all the way down.** Git mirrors expose only encrypted YAML from `platform-config`. The `.sops.yaml` shipped with the site lists the Age recipient, but private Age keys never enter the repo or CI logs.
- **GitHub secrets for transient access.** Deploy keys, registry credentials, and VPS ssh material all live in the Actions secret store. The workflow logs confirm their fingerprints but never echo the secret bodies.
- **Manifest hygiene.** The Git manifest only lists repos we are comfortable shipping publicly. A quick `rg 'ENC[' site-output/git` shows encrypted blobs only; there are no plaintext API keys in the generated site.

## Results

Prod deploys are deterministic, auditable, and serve from a rootless Nginx image hardened for our WebDAV hangover. The new Let’s Encrypt permission shim keeps future renewals from breaking the container, and future upgrades—image signing, SBOM generation, automatic Age key rotation—slot neatly into the existing pipeline so we can keep tightening the loop without shipping heroics every release.
