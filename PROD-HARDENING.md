# Prod container hardening (post rootless runtime)

Scope: production deployments driven by `.github/workflows/prod-deploy.yml`, which render and apply Docker Compose via Ansible (`ansible/roles/app_deploy`). This doc evaluates hardening steps for the main site container and the `rss-proxy` companion in that flow.

## Current state (as of 2026-01-22)

- Main image runs as non-root (`USER 101:101` in `Dockerfile`).
- rss-proxy runs as non-root (`USER 101:101` in `rss-proxy/Dockerfile`).
- Compose enforces `user: "101:101"` for both services in `ansible/roles/app_deploy/templates/docker-compose.yml.j2`.
- Compose drops all Linux capabilities and sets `no-new-privileges` for both services in `ansible/roles/app_deploy/templates/docker-compose.yml.j2`.
- Host `site_output/feeds` ownership is adjusted for the rootless runtime in `ansible/roles/app_deploy/tasks/main.yml`.
- Main service mounts site output read-only when `rss_proxy_enabled` is true.
- rss-proxy mounts only `site_output/feeds` as writable, and RSS output now lives under `feeds/rss.xml`.

## Hardening steps: viability, path, and risk

Legend:
- Viability: High / Medium / Low
- Risk: Low / Medium / High (risk of breaking deploy/runtime)

| Step | Viability | Path to implement | Risk | Notes |
| --- | --- | --- | --- | --- |
| Enforce non-root UID/GID | High | Already done in `Dockerfile`, `rss-proxy/Dockerfile`, and compose template | Low | Verified in repo; keep `container_runtime_uid/gid` in `ansible/group_vars/all.yml`. |
| Ensure host bind mounts are writable by runtime UID | High | `ansible/roles/app_deploy/tasks/main.yml` (adjusts `site_output_host_path/feeds`) | Low | Required for rss-proxy to write `feeds/rss.xml` and `feeds/combined.json`. |
| Drop Linux capabilities | High | Done in `ansible/roles/app_deploy/templates/docker-compose.yml.j2` (and local `docker-compose.yml`) | Low | Both services listen on high ports (8080/8443/7070), so `NET_BIND_SERVICE` is not required. Validate WebDAV writes. |
| no-new-privileges | High | Done in `ansible/roles/app_deploy/templates/docker-compose.yml.j2` (and local `docker-compose.yml`) | Low | Prevents privilege escalation; should not affect normal operation. |
| Read-only root filesystem | Medium | Set `read_only: true` and add `tmpfs` for `/tmp`, `/var/run`, `/var/log/nginx`, `/var/lib/nginx`, `/tmp/webdav` (nginx) and `/tmp` (rss-proxy). Consider logging to stdout to reduce writable paths. | Medium | Nginx currently logs to `/var/log/nginx/*.log` and uses `/var/lib/nginx`; both need tmpfs or log redirection. |
| Explicit resource limits | High | Add `mem_limit`, `cpus`, `pids_limit` to compose template for both services | Low/Medium | Limits reduce blast radius for DoS but can cause memory pressure if set too low. |
| Restrict writable mounts | Medium | Done: rss-proxy mounts only `site-output/feeds`, and `rss.outputPath` is set to `feeds/rss.xml` so writes stay within that directory. | Low | Nginx serves `/rss.xml` via a `try_files` alias to keep legacy URLs working. |
| Disable shell utilities | Medium | Build minimal images (remove `bash`, `npm` in runtime images) | Medium | Requires Dockerfile surgery and possibly multi-stage build for rss-proxy. |
| Network egress controls | Low/Medium | Host-level firewall/iptables or Docker network policies | Medium/High | Needed only if external feeds or outbound traffic must be constrained. |
| Custom seccomp/apparmor profiles | Medium | Host config + compose `security_opt` | Medium | Good defense-in-depth but higher operational complexity. |
| Rootless Docker daemon or userns-remap | Low/Medium | Host daemon config (`/etc/docker/daemon.json`) | High | Stronger isolation but can break volume permissions and tooling expectations. |

## Recommended order (low-risk first)

1. [x] Drop Linux capabilities and set `no-new-privileges` in compose.
2. Add resource limits.
3. Add read-only rootfs + tmpfs mounts (test carefully).
4. [x] Narrow rss-proxy writable mounts to reduce content tampering surface.
5. Consider host-level isolation (userns-remap/rootless daemon) if required by policy.

## Validation checklist

- `docker compose exec cm id` and `docker compose exec rss-proxy id` report UID/GID 101.
- Nginx serves content and WebDAV writes still work.
- rss-proxy can update `feeds/rss.xml` and `feeds/combined.json` (and `/rss.xml` still resolves).
- Health checks pass (`/health`).
- Logs visible in `docker compose logs` (if read-only filesystem is enabled, verify log path strategy).
