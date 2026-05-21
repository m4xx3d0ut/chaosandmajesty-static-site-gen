#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE_DIR="$ROOT_DIR/workerbee/cm-dual-workerbee"
STAGE_DIR="${WORKERBEE_STAGE_DIR:-$ROOT_DIR/.local/workerbee/cm-dual-workerbee}"
PROJECT="${WORKERBEE_PROJECT:?Set WORKERBEE_PROJECT to the WorkerBee project id.}"
TAG="${WORKERBEE_TAG:-local}"
BASE_DOMAIN="${WORKERBEE_BASE_DOMAIN:-workerbee.localhost}"
HTTPS_PORT="${WORKERBEE_HTTPS_PORT:-19443}"
CORE_HOST="chaosandmajesty.${PROJECT}.${BASE_DOMAIN}"
BUSINESS_HOST="cosmosmechane.${PROJECT}.${BASE_DOMAIN}"

render_template() {
  local src="$1"
  local dst="$2"

  mkdir -p "$(dirname "$dst")"
  sed \
    -e "s|__WORKERBEE_PROJECT__|${PROJECT}|g" \
    -e "s|__WORKERBEE_TAG__|${TAG}|g" \
    -e "s|__WORKERBEE_BASE_DOMAIN__|${BASE_DOMAIN}|g" \
    -e "s|__WORKERBEE_HTTPS_PORT__|${HTTPS_PORT}|g" \
    -e "s|__CORE_HOST__|${CORE_HOST}|g" \
    -e "s|__BUSINESS_HOST__|${BUSINESS_HOST}|g" \
    "$src" > "$dst"
}

render_template "$BUNDLE_DIR/manifests/cm-site.k1s.yaml" "$STAGE_DIR/manifests/cm-site.k1s.yaml"
render_template "$BUNDLE_DIR/manifests/cm-business.k1s.yaml" "$STAGE_DIR/manifests/cm-business.k1s.yaml"
render_template "$BUNDLE_DIR/nginx/cm-main.default.conf.template" "$STAGE_DIR/nginx/cm-main.default.conf"
render_template "$BUNDLE_DIR/nginx/cm-business.default.conf.template" "$STAGE_DIR/nginx/cm-business.default.conf"

printf 'Rendered WorkerBee stage: %s\n' "$STAGE_DIR"
printf 'Core host: %s\n' "$CORE_HOST"
printf 'Business host: %s\n' "$BUSINESS_HOST"
printf 'Image tags: cm-main-workerbee:%s, cm-business-workerbee:%s\n' "$TAG" "$TAG"
