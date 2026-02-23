# syntax=docker/dockerfile:1.6

# Stage 1: build the static site bundle
FROM node:20-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
ARG SYNC_GIT_MANIFEST_URL_REWRITE
ARG BUILD_COMMAND="./build-site.sh"
ARG BUILD_WORKDIR="/app"
ARG SITE_OUTPUT_DIR="/app/site-output"
ENV SYNC_GIT_MANIFEST_URL_REWRITE=${SYNC_GIT_MANIFEST_URL_REWRITE}

# Install build dependencies and clean apt cache afterwards
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        openssh-client \
        python3 \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install JS dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and build the site
COPY . .
RUN --mount=type=ssh \
    set -eux; \
    export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=no"; \
    cd "${BUILD_WORKDIR}"; \
    SITE_OUTPUT_DIR="${SITE_OUTPUT_DIR}" sh -c "${BUILD_COMMAND}"

# Stage 1b: build a dav_ext module that matches the bundled nginx
FROM nginxinc/nginx-unprivileged:alpine AS dav_ext_builder
USER root
ARG DAV_EXT_MODULE_VERSION=v3.0.0
RUN set -eux; \
    apk add --no-cache --virtual .build-deps \
        build-base \
        curl \
        linux-headers \
        libxml2-dev \
        libxslt-dev \
        openssl-dev \
        pcre2-dev \
        tar \
        zlib-dev; \
    NGINX_VERSION="$(nginx -v 2>&1 | sed -n 's|nginx version: nginx/||p')"; \
    CONFIGURE_ARGS="$(nginx -V 2>&1 | sed -n 's/^configure arguments: //p')"; \
    mkdir -p /tmp/build; \
    cd /tmp/build; \
    curl -fSL "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -o nginx.tar.gz; \
    tar -xzf nginx.tar.gz; \
    curl -fSL "https://github.com/arut/nginx-dav-ext-module/archive/refs/tags/${DAV_EXT_MODULE_VERSION}.tar.gz" -o dav_ext.tar.gz; \
    tar -xzf dav_ext.tar.gz; \
    cd nginx-"${NGINX_VERSION}"; \
    eval "set -- ${CONFIGURE_ARGS}"; \
    ./configure "$@" --with-compat --add-dynamic-module="../nginx-dav-ext-module-${DAV_EXT_MODULE_VERSION#v}"; \
    make modules; \
    install -m 644 objs/ngx_http_dav_ext_module.so /tmp/ngx_http_dav_ext_module.so; \
    apk del .build-deps; \
    rm -rf /tmp/build

# Stage 2: lightweight Nginx image serving the static bundle
FROM nginxinc/nginx-unprivileged:alpine

# Allow choosing which nginx config to bake into the runtime image (prod vs dev)
ARG NGINX_CONFIG="nginx/default.conf"
ARG SITE_OUTPUT_DIR="/app/site-output"

LABEL org.opencontainers.image.source="https://gitea.core.home.arpa/m4xx3d0ut/chaosandmajesty-static-site-gen" \
      org.opencontainers.image.description="Chaos & Majesty static site served by hardened Nginx"

USER root

RUN set -eux; \
    apk add --no-cache curl; \
    addgroup -S -g 101 nginx || true; \
    adduser -S -D -H -u 101 -G nginx nginx || true; \
    rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf; \
    install -d -o 101 -g 101 /etc/nginx/auth; \
    install -d /etc/nginx/modules; \
    install -d -o 101 -g 101 /usr/share/nginx/html/dav; \
    install -d -o 101 -g 101 /var/www/letsencrypt/.well-known/acme-challenge; \
    install -d /run/nginx; \
    chown 101:101 /run/nginx; \
    install -d -o 101 -g 101 /var/lib/nginx; \
    install -d -o 101 -g 101 /var/log/nginx; \
    install -d -o 101 -g 101 /tmp/webdav; \
    chown -R 101:101 /var/lib/nginx /var/log/nginx

# Copy the generated site and nginx configuration
COPY --from=builder --chown=101:101 ${SITE_OUTPUT_DIR}/ /usr/share/nginx/html/
COPY --from=builder --chown=101:101 /app/${NGINX_CONFIG} /etc/nginx/http.d/default.conf
COPY --from=dav_ext_builder /tmp/ngx_http_dav_ext_module.so /etc/nginx/modules/ngx_http_dav_ext_module.so
COPY nginx/nginx.conf /etc/nginx/nginx.conf

USER 101:101

EXPOSE 8080 8443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
