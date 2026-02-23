#!/bin/sh

set -eu

IMAGE="${1:-${BUSINESS_IMAGE:-}}"
MODE="${2:-}"

if [ -z "${IMAGE}" ]; then
    echo "Usage: $0 <image-ref> [--detach]" >&2
    echo "Example: $0 ghcr.io/chaosandmajesty/cm-site-business:prod" >&2
    exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
    echo "Error: openssl is required for local TLS fixtures." >&2
    exit 1
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/cm-business-test.XXXXXX")"
LE_DIR="${WORKDIR}/letsencrypt"
LIVE_DIR="${LE_DIR}/live/cosmosmechane.com"
CONTAINER="cm-business-local-$$"

cleanup() {
    docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
    rm -rf "${WORKDIR}"
}
trap cleanup EXIT

mkdir -p "${LIVE_DIR}"

openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "${LIVE_DIR}/privkey.pem" \
    -out "${LIVE_DIR}/fullchain.pem" \
    -days 1 \
    -subj "/CN=cosmosmechane.com" >/dev/null 2>&1

cat > "${LE_DIR}/options-ssl-nginx.conf" <<'EOF'
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
EOF

echo "Generating temporary DH params (this may take a minute)..."
openssl dhparam -out "${LE_DIR}/ssl-dhparams.pem" 2048 >/dev/null 2>&1

# Ensure the unprivileged nginx user can read the fixtures.
chmod 644 "${LIVE_DIR}/privkey.pem" "${LIVE_DIR}/fullchain.pem"
chmod 644 "${LE_DIR}/options-ssl-nginx.conf" "${LE_DIR}/ssl-dhparams.pem"

docker run -d --rm \
    --name "${CONTAINER}" \
    -p 8081:8080 \
    -p 8444:8443 \
    -v "${LE_DIR}:/etc/letsencrypt:ro" \
    "${IMAGE}" >/dev/null

echo "Business image running as ${CONTAINER}."
echo "HTTP:  curl -H 'Host: cosmosmechane.com' http://127.0.0.1:8081/"
echo "HTTPS: curl -k -H 'Host: cosmosmechane.com' https://127.0.0.1:8444/"

if [ "${MODE}" = "--detach" ]; then
    echo "Detach mode enabled. Stop with: docker rm -f ${CONTAINER}"
    exit 0
fi

echo "Press Ctrl-C to stop and clean up."
docker logs -f "${CONTAINER}"
