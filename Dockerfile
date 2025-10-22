# syntax=docker/dockerfile:1.6

# Allow pinning the Alpine base used by the runtime image
ARG ALPINE_VERSION=3.20

# Stage 1: build the static site bundle
FROM node:20-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
ARG SYNC_GIT_MANIFEST_URL_REWRITE
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
    GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no" ./build-site.sh

# Stage 2: lightweight Nginx image serving the static bundle
FROM alpine:${ALPINE_VERSION}

# Allow choosing which nginx config to bake into the runtime image (prod vs dev)
ARG NGINX_CONFIG="nginx/default.conf"

LABEL org.opencontainers.image.source="https://gitea.core.home.arpa/m4xx3d0ut/chaosandmajesty-static-site-gen" \
      org.opencontainers.image.description="Chaos & Majesty static site served by hardened Nginx"

RUN set -eux; \
    apk add --no-cache curl nginx nginx-mod-http-dav-ext; \
    addgroup -S -g 33 www-data 2>/dev/null || true; \
    adduser -S -D -H -u 33 -G www-data www-data 2>/dev/null || true; \
    rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf; \
    install -d -o www-data -g www-data /etc/nginx/auth; \
    install -d -o www-data -g www-data /usr/share/nginx/html/dav; \
    install -d -o www-data -g www-data /var/www/letsencrypt/.well-known/acme-challenge; \
    install -d -o www-data -g www-data /tmp/webdav; \
    chown -R www-data:www-data /var/lib/nginx /var/log/nginx

# Workers run as www-data (uid 33) to match the host WebDAV htpasswd ownership

# Copy the generated site and nginx configuration
COPY --from=builder --chown=www-data:www-data /app/site-output/ /usr/share/nginx/html/
COPY --from=builder --chown=www-data:www-data /app/${NGINX_CONFIG} /etc/nginx/http.d/default.conf
COPY nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080 8443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
