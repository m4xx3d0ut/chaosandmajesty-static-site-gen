# syntax=docker/dockerfile:1.6

FROM nginxinc/nginx-unprivileged:alpine AS dev

USER root

RUN apk add --no-cache nodejs npm supervisor bash

WORKDIR /app

COPY rss-proxy/package*.json ./rss-proxy/
RUN cd rss-proxy \
    && npm install --omit=dev \
    && rm -rf /app/node_modules \
    && ln -s /app/rss-proxy/node_modules /app/node_modules

COPY rss-proxy ./rss-proxy
COPY static-sitegen ./static-sitegen
COPY smoke-test.yaml ./smoke-test.yaml

COPY --chown=nginx:nginx site-output/ /usr/share/nginx/html/
COPY --chown=nginx:nginx .local/workerbee/cm-dual-workerbee/nginx/cm-main.default.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx workerbee/cm-dual-workerbee/nginx/supervisord.conf /etc/supervisor/conf.d/cm-workerbee.conf

ENV RSS_CONFIG_PATH=/app/smoke-test.yaml \
    RSS_OUTPUT_DIR=/usr/share/nginx/html \
    RSS_REFRESH_INTERVAL=600000 \
    RSS_PROXY_PORT=7070

USER 101:101

EXPOSE 8080

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/cm-workerbee.conf"]
