# WorkerBee Dual-Site Bundle

This bundle lets a WorkerBee agent bring up both local review sites for this
repo:

- `chaosandmajesty.<project>.workerbee.localhost`
- `cosmosmechane.<project>.workerbee.localhost`

The checked-in k1s manifests are templates. Render them with the project id
WorkerBee assigned to the current workspace before validation or deploy:

```bash
WORKERBEE_PROJECT=<project-id> \
WORKERBEE_TAG=local \
bash workerbee/cm-dual-workerbee/render-stage.sh
```

By default, rendered manifests and Nginx configs are written to
`.local/workerbee/cm-dual-workerbee/`.

## Expected Build Inputs

The image builds expect both static outputs to already exist:

```bash
./build-site.sh
cd business-site
SITE_OUTPUT_DIR=site-output/cosmos-test ./scripts/build-cosmos-test.sh
```

The root site image also runs the RSS proxy used by the local dev container.

## WorkerBee MCP Flow

Use the current WorkerBee project id for every call.

1. Build `cm-main-workerbee:<tag>` from repo root with
   `workerbee/cm-dual-workerbee/docker/cm-main.Dockerfile`.
2. Build `cm-business-workerbee:<tag>` from repo root with
   `workerbee/cm-dual-workerbee/docker/cm-business.Dockerfile`.
3. Validate `.local/workerbee/cm-dual-workerbee`.
4. Deploy `.local/workerbee/cm-dual-workerbee` to the local WorkerBee target.
5. Probe both hostnames over the WorkerBee HTTPS ingress.

If the WorkerBee HTTPS port differs from `19443`, set
`WORKERBEE_HTTPS_PORT` while rendering. If the local ingress domain differs
from `workerbee.localhost`, set `WORKERBEE_BASE_DOMAIN`.
