# syntax=docker/dockerfile:1.6

# Stage 1: build the static site bundle
FROM node:20-slim AS builder
WORKDIR /app
ENV NODE_ENV=production

# Install build dependencies and clean apt cache afterwards
RUN apt-get update \ 
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        python3 \
        build-essential \ 
    && rm -rf /var/lib/apt/lists/*

# Install JS dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and build the site
COPY . .
RUN ./build-site.sh

# Stage 2: lightweight Nginx image serving the static bundle
FROM nginxinc/nginx-unprivileged:alpine

LABEL org.opencontainers.image.source="https://gitea.core.home.arpa/m4xx3d0ut/chaosandmajesty-static-site-gen" \
      org.opencontainers.image.description="Chaos & Majesty static site served by hardened Nginx"

# Provide directory for optional basic-auth files or other runtime mounts
USER root

RUN apk add --no-cache curl \
    && mkdir -p /etc/nginx/auth \
    && mkdir -p /usr/share/nginx/html/dav \
    && mkdir -p /var/www/letsencrypt/.well-known/acme-challenge \
    && mkdir -p /tmp/webdav \
    && chown -R nginx:nginx /etc/nginx /usr/share/nginx/html /var/www/letsencrypt /tmp/webdav

USER nginx

# Copy the generated site and nginx configuration
COPY --from=builder --chown=nginx:nginx /app/site-output/ /usr/share/nginx/html/
COPY --from=builder --chown=nginx:nginx /app/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080 8443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
