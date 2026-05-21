# WorkerBee Local Runtime

This repo can be reviewed in WorkerBee as two sites served on separate local
hostnames:

- core site: `https://chaosandmajesty.<project>.workerbee.localhost:19443/`
- business site: `https://cosmosmechane.<project>.workerbee.localhost:19443/`

The reusable WorkerBee bundle lives in
`workerbee/cm-dual-workerbee/`. It stores k1s manifest templates, Nginx
templates, and Dockerfiles for the two images. The templates must be rendered
for the current WorkerBee project before validation and deploy because the
k1s namespace and ingress hostnames are project-scoped.

## Prerequisites

Start a WorkerBee session for the repo and note the project id. If git access
is needed during the build, use the repo-required SSH identity:

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/gitea-core -o IdentitiesOnly=yes -o IdentityAgent=none" git status
```

Build both static outputs from the repo root:

```bash
./build-site.sh
cd business-site
SITE_OUTPUT_DIR=site-output/cosmos-test ./scripts/build-cosmos-test.sh
```

## Render

Render project-specific manifests and Nginx configs:

```bash
WORKERBEE_PROJECT=<project-id> \
WORKERBEE_TAG=local \
bash workerbee/cm-dual-workerbee/render-stage.sh
```

The default rendered stage is `.local/workerbee/cm-dual-workerbee/`. It is
ignored by git and can be recreated at any time. Optional render settings:

- `WORKERBEE_TAG`: image tag used by both manifests, default `local`.
- `WORKERBEE_BASE_DOMAIN`: ingress base domain, default `workerbee.localhost`.
- `WORKERBEE_HTTPS_PORT`: ingress HTTPS port used in local cross-site rewrites,
  default `19443`.
- `WORKERBEE_STAGE_DIR`: alternate render output directory. Use the default
  `.local/workerbee/cm-dual-workerbee` for image builds because the Dockerfiles
  copy the rendered Nginx configs from that path.

## Build And Deploy

Using WorkerBee MCP, build both images from the repo root:

```text
workerbee_v1_image_build(
  project=<project-id>,
  context=/home/m4xx3d0ut/git/chaosandmajesty-static-site-gen,
  dockerfile=workerbee/cm-dual-workerbee/docker/cm-main.Dockerfile,
  tag=cm-main-workerbee:<tag>
)

workerbee_v1_image_build(
  project=<project-id>,
  context=/home/m4xx3d0ut/git/chaosandmajesty-static-site-gen,
  dockerfile=workerbee/cm-dual-workerbee/docker/cm-business.Dockerfile,
  tag=cm-business-workerbee:<tag>
)
```

Then validate and deploy the rendered stage:

```text
workerbee_v1_manifest_validate(
  project=<project-id>,
  stage=.local/workerbee/cm-dual-workerbee
)

workerbee_v1_manifest_deploy_local(
  project=<project-id>,
  stage=.local/workerbee/cm-dual-workerbee,
  target=workerbee
)
```

## Smoke Checks

Probe both root pages and the WorkerBee blog post on both hostnames:

```text
https://chaosandmajesty.<project>.workerbee.localhost:19443/
https://chaosandmajesty.<project>.workerbee.localhost:19443/blog/workerbee-first-week-runtime-truth-surface.html
https://cosmosmechane.<project>.workerbee.localhost:19443/
https://cosmosmechane.<project>.workerbee.localhost:19443/blog/workerbee-first-week-runtime-truth-surface.html
```

The root site image includes the RSS proxy and `/sse/feeds`. The business site
image is static Nginx only. Both images expose `/health` for k1s probes.
