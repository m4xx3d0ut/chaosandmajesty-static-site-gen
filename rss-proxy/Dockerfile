FROM node:20-slim

WORKDIR /app

COPY rss-proxy/package*.json ./rss-proxy/
RUN cd rss-proxy \
    && npm install --omit=dev \
    && rm -rf /app/node_modules \
    && ln -s /app/rss-proxy/node_modules /app/node_modules

COPY rss-proxy ./rss-proxy
COPY static-sitegen ./static-sitegen
COPY smoke-test.yaml ./smoke-test.yaml

ENV RSS_CONFIG_PATH=/app/smoke-test.yaml
ENV RSS_OUTPUT_DIR=/app/site-output
ENV RSS_REFRESH_INTERVAL=600000

EXPOSE 7070

CMD ["node", "rss-proxy/index.mjs"]
