# Repository Guidelines

## Project Structure & Module Organization
The static generator lives in `static-sitegen/` (ES modules in `lib/`, CLI at `bin/sitegen.js`, EJS templates under `templates/`). YAML configs such as `smoke-test.yaml` describe the site and render into `site-output/`. Designers' assets belong in `cm-source/`; run `prepare-cm-files.sh` to hydrate `static-sitegen/assets/` with JS, CSS, images, and partials. Helper scripts (`build-site.sh`, `prepare-cm-files.sh`) pair with Docker artifacts (`Dockerfile`, `docker-compose.yml`, `Makefile`) for local or container builds.

## Build, Test, and Development Commands
- `./build-site.sh`: invokes `static-sitegen/bin/sitegen.js` with `smoke-test.yaml` and validates `site-output/`.
- `make build-local` mirrors the script; `make build`, `make up`, `make down`, `make logs` cover Docker workflows.
- `make serve-local` serves `site-output/` on `http://localhost:8080`.
- `make test` runs the Node 18 smoke container and calls `npm test`; expand it as coverage grows.

## Coding Style & Naming Conventions
Code is modern ES module JavaScript with 2-space indentation, single quotes, and small focused helpers in `lib/`. Keep CLI argument parsing in `bin/sitegen.js`; templates follow the `cm-*.ejs` pattern. Assets, configs, and generated files should stay kebab-case to match copy logic. No linter is enforced, so mirror the existing style and double-check imports remain sorted by dependency weight.

## Testing Guidelines
`npm test` is a stub today; replace it with unit or smoke checks when you add modules. Always rerun `./build-site.sh` after code, template, or YAML edits and inspect `site-output/` for regressions. Future tests can live beside the modules (e.g., `generateSite.spec.js`) with fixture YAML under `tests/fixtures/`. When templates change, load `make serve-local` and confirm terminal interactions still render as expected.

## Commit & Pull Request Guidelines
Use the `<scope>: <present-tense summary>` convention from history (`cicd: configure buildkit for insecure reg.`). Keep commits focused, include generated assets only when reviewers need them, and call out new configuration knobs. Pull requests should describe the scenario, link issues, and paste the latest `./build-site.sh` or `make test` output. Add screenshots or terminal recordings whenever UI or console behavior shifts.

## Asset & Configuration Notes
Never store secrets in YAML. Keep reusable defaults in `cm-source/` and introduce new config files for project-specific variants. For 3D logo support ensure `cmLogo.js` and SVG assets stay in sync, updating `prepare-cm-files.sh` if more paths must be copied. Favor additive configuration keys so existing builds remain compatible.
