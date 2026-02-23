# Prod Deployment – Initial VPS Bring-Up

This runbook walks through preparing the Linode VPS (`chaosandmajesty.com`) for the
containerised Chaos & Majesty site, performing the first Ansible-driven release,
and validating the Gitea workflow.

> **Scope:** host runs Docker, deploys https via the containerised Nginx, keeps the
> existing `/var/www/html/dav` WebDAV share, and reuses the Let's Encrypt material
> already managed on the VPS.

## 1. Prerequisites
- Docker Engine + Compose plugin installed on the VPS (`docker --version`,
  `docker compose version`).
- `deploy` user created, part of the `docker` group, with your CI/public key in
  `~deploy/.ssh/authorized_keys` (already completed).
- Existing certificates under `/etc/letsencrypt/` (Certbot-managed).
- Gitea runner with Docker access (self-hosted) – required for the workflow.
- Secrets staged in the repository settings (see §4).

## 2. One-Time VPS Preparation
Login as root (or a sudoer) and run:

```bash
# ensure runtime directories exist
install -d -o deploy -g deploy -m 755 /opt/chaosandmajesty
install -d -o root -g root -m 755 /var/www/letsencrypt
install -d -o root -g root -m 755 /var/www/letsencrypt/.well-known/acme-challenge
install -d -o root -g root -m 775 /var/www/html/dav
install -d -o deploy -g deploy -m 700 ~deploy/.ssh
cat <<'PUBKEY' >> ~deploy/.ssh/authorized_keys
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGbN0ZidnAYvD7hMBZV/sdvFg9S1iHK/ExBgCHCClMgw gitea-ci-deploy (prod)
PUBKEY
chmod 600 ~deploy/.ssh/authorized_keys

# confirm Docker permissions for deploy user (newgrp required for current session)
id deploy
```

Append the CI user's public key to `~deploy/.ssh/authorized_keys` if you
haven't already (replace `<deploy-public-key>` in the snippet above), then
`chmod 600` the file.

> Renewal tip: keep your existing Certbot cron/systemd timer. If it uses the
> webroot plugin, point it at `/var/www/letsencrypt` so challenges land in the
> mounted directory (`certbot renew --webroot -w /var/www/letsencrypt`).

> Business site DNS-01 guide: see `docs/prod-dns01-cloudflare.md`.

### SSH Known Hosts
From the CI runner (or your workstation), prime the known_hosts entry so
Ansible/SSH skip the prompt:

```bash
ssh-keyscan -H chaosandmajesty.com >> ~/.ssh/known_hosts
```

Paste this output into the `KNOWN_HOSTS` secret if you prefer the workflow to
skip dynamic key scanning.

## 3. Dry-Run the Playbook Locally (optional but recommended)
From this repository on your workstation:

```bash
ansible-galaxy collection install -r ansible/requirements.yml
export ANSIBLE_HOST_KEY_CHECKING=false  # or manage known_hosts as above
ansible-playbook -i ansible/inventory/hosts.ini ansible/deploy.yml \
  -e "registry_username=${REGISTRY_USERNAME}" \
  -e "registry_password=${REGISTRY_PASSWORD}" \
  --check
```

Use `--check` for a read-only preview; drop it for the actual deployment once the
workflow succeeds.

## 4. Configure Gitea Secrets
Populate these secrets in **Repository → Settings → Secrets → Actions** before
pushing to `prod`. Create or update each entry individually so you can test the
workflow as you go.

### Pick a public registry
The prod workflow runs on a VPS that cannot reach your lab-only registry
(`reg.microk8s.core.home.arpa:32000`). Push your production image to a public
registry instead. Any of the following work well:

- **GitHub Container Registry (GHCR)** – Anonymous pulls allowed, currently no
  storage or bandwidth fees for public images. Uses `ghcr.io/<owner>/<image>`.
  Docs: https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- **Docker Hub** – Widely supported; anonymous pulls are rate limited for free
  plans. Docs: https://docs.docker.com/docker-hub/usage/pulls/
- **GitLab Container Registry** – Good fit if you already have GitLab tooling
  in place. Docs: https://docs.gitlab.com/user/packages/container_registry/
- **Quay.io** – Mature hosted registry with strong org features. Docs:
  https://www.redhat.com/en/technologies/cloud-computing/quay
- **Amazon ECR Public** – CDN-backed distribution and generous public tiers for
  high-traffic images. Docs: https://aws.amazon.com/ecr/public/

For this project, GHCR is usually the smoothest option: your runner already has
internet access, the CI only pushes on release, and the VPS pulls occasionally,
so the anonymous pull policy is more than enough.

### Secret checklist

1. **`REGISTRY_HOST`** – Hostname of your container registry. For GitHub
   Container Registry use `ghcr.io`; for Gitea Container Registry use the
   domain of your instance (e.g. `gitea.chaosandmajesty.com`). This must be
   reachable from the public VPS — unlike the dev workflow’s
   `reg.microk8s.core.home.arpa:32000` NodePort, which lives only on the lab
   network.
2. **`REGISTRY_NAMESPACE`** – Namespace/owner portion of the image path. For
   GHCR this matches your GitHub user/org (e.g. `chaosandmajesty`). Leave blank
   only if the registry expects images at the root.
3. **`IMAGE_NAME`** – Repository name portion of the image path (for example
   `cm-site`). The workflow tags every prod deploy with `prod` and
   `prod-<sha>`.
4. **`REGISTRY_USERNAME` / `REGISTRY_PASSWORD`** – Credentials with push
   permission to the registry. For GHCR create a fine-grained PAT with `read`
   and `write:packages` scopes. For self-hosted registries, use a robot/service
   account. Paste the username as-is; paste the token/password exactly, without
   extra whitespace.
5. **`CI_KNOWN_HOSTS`** – Pinned `ssh-keyscan -p 2222 gitea-ssh.git-local.svc.cluster.local`
   output. Capture once from a trusted network, verify the fingerprint, and paste the line
   verbatim so the CI refuses unexpected host keys.
6. **`VPS_HOST`** – Public hostname or IP for the VPS. Use
   `chaosandmajesty.com` unless you are targeting a different environment.
7. **`VPS_USER`** – SSH username the playbook uses. This repository assumes the
   `deploy` user exists and has passwordless sudo for the managed services.
8. **`SSH_PRIVATE_KEY`** – Private key that matches the public key installed on
   the `deploy` account. Copy the key contents (including the `-----BEGIN` and
   `-----END` lines) directly into the secret. Ensure the key is not protected
   by a passphrase; the workflow cannot prompt for one.
9. **`KNOWN_HOSTS`** – Pre-seeded line from `ssh-keyscan -H chaosandmajesty.com`.
   Capture this from a trusted workstation and paste the output; the workflow no longer
   attempts runtime scans, so this secret is required.

After saving each secret, use the **Test secret** button (if available in your
Gitea version) or re-run the `prod` workflow to confirm the value is
accessible.

### Example: wiring GHCR
1. Create a GitHub Personal Access Token with `write:packages` and
   `read:packages` scopes (classic PAT) or a fine-grained token scoped to your
   container packages.
2. Populate the secrets above with:
   - `REGISTRY_HOST=ghcr.io`
   - `REGISTRY_NAMESPACE=<your GitHub username or org>`
   - `IMAGE_NAME=cm-site` (or your preferred image name)
   - `REGISTRY_USERNAME=<same GitHub account>`
   - `REGISTRY_PASSWORD=<the PAT>`
3. Push to `prod`; the workflow logs in to GHCR, builds, and tags:
   - `${REGISTRY_HOST}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:prod`
   - `${REGISTRY_HOST}/${REGISTRY_NAMESPACE}/${IMAGE_NAME}:prod-<short-sha>`

Skip GHCR only if you need extremely high anonymous throughput with regional
mirrors—in that case consider Amazon ECR Public and adjust the secrets to match
its host, namespace, and credentials.

## 5. First Managed Deployment
1. Commit the latest CI/CD and Ansible changes to `prod` (merge from `main`).
2. Push to `prod`; the workflow `.github/workflows/prod-deploy.yml` triggers.
3. Monitor the job in Gitea – it should:
   - install dependencies & run `./build-site.sh`
   - build & push `prod` and `prod-<sha>` tags
   - stop the host `nginx` service via Ansible
   - render `/opt/chaosandmajesty/docker-compose.yml`
   - start the container exposing 80/443 and mount `/var/www/html/dav`,
     `/etc/letsencrypt`, `/var/www/letsencrypt`
   - probe `http://127.0.0.1:80/health`

4. Validate on the VPS:

```bash
sudo systemctl status nginx  # should be inactive
sudo docker ps               # cm_site container up
sudo docker logs cm-prod     # optional – confirm no TLS errors
curl -kI https://chaosandmajesty.com/health
```

5. Validate WebDAV: ensure `/var/www/html/dav` contents are still present and
   reachable from your Joplin client.
6. If you relied on non-www subdomains previously handled by the host nginx,
   extend `nginx/default.conf` and redeploy to add the necessary proxy blocks.

## 6. Troubleshooting & Rollback
- To revert quickly, re-enable the system nginx service:
  `sudo systemctl enable --now nginx`.
- Redeploy the previous container tag:
  `docker compose -f /opt/chaosandmajesty/docker-compose.yml up -d` after editing
  `.current-image` with the prior tag (or run the playbook with `image_tag=prod-<sha>`).
- Health check failures usually indicate certificate mount/permissions or WebDAV
  temp directory issues – inspect `docker logs cm-prod` and
  `/opt/chaosandmajesty/docker-compose.yml`.

With the first deployment complete, future pushes to `prod` should cycle through
image build, push, and automated rollout without manual intervention.
