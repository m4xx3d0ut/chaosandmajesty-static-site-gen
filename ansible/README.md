# Chaos & Majesty Ansible Deployment

This playbook deploys the production container image to the Linode VPS via SSH.

## Layout
- `inventory/hosts.ini` – target hosts; override `ansible_host` before use.
- `group_vars/all.yml` – defaults (install path, image coordinates, mounts).
- `deploy.yml` – entrypoint playbook that applies the `app_deploy` role.
- `requirements.yml` – Ansible collections required (`community.docker`).
- `roles/app_deploy` – renders Docker Compose configuration and deploys the site container.
- `../config/git/manifest.txt` – repository manifest consumed by the static site generator.

## Usage
1. Install dependencies:
   ```bash
   ansible-galaxy collection install -r requirements.yml
   ```
2. Provide the target host address by editing `inventory/hosts.ini` (defaults to
   `chaosandmajesty.com`) or by passing
   `-i "prod," -e ansible_host=vps.example.com`.
3. Supply the registry coordinates and credentials (if private):
   ```bash
   ansible-playbook -i inventory/hosts.ini deploy.yml \
     -e image_registry=ghcr.io \
     -e image_namespace=chaosandmajesty \
     -e image_name=cm-site \
     -e image_tag=prod
   ```
4. When running from CI, export `REGISTRY_USERNAME`/`REGISTRY_PASSWORD` secrets
   and pass them via `-e registry_username=...` or environment variable lookup
   in the workflow.

Key defaults (override in `group_vars/all.yml` or via extra-vars):
- `webdav_host_path=/var/www/html/dav` keeps the host Joplin share mounted.
- `letsencrypt_host_path=/etc/letsencrypt` shares existing certificates read-only.
- `acme_webroot_host_path=/var/www/letsencrypt` is used for HTTP-01 challenges.
- `auth_file_host_path=/etc/nginx/auth` mounts your existing WebDAV htpasswd directory read-only so credentials continue to work.
- `rss_proxy_enabled=true` deploys the SSE RSS proxy sidecar and binds `site_output_host_path` into both containers.
- `rss_proxy_image_name=rss-proxy` tags the companion RSS proxy image (same registry/namespace as the site image).
- `disable_host_nginx=true` stops and disables the system nginx service at deploy time.

The role will render a Docker Compose project in `{{ app_dir }}` (default
`/opt/chaosandmajesty`), ensure the WebDAV directory exists on the host, pull the
specified image, and recreate the container. A health check against
`http://127.0.0.1:{{ healthcheck_port }}` guards against silent failures.

## Git manifest

The static site generator consumes `config/git/manifest.txt` to know which
repositories to mirror locally during `./build-site.sh`. Update that manifest
before builds so the Git page sidebar stays in sync with your catalog.
