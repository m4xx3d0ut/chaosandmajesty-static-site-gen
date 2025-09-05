# Production stage - expects pre-built site-output
FROM nginxinc/nginx-unprivileged:alpine AS production

# Copy pre-built site from local development
COPY --chown=nginx:nginx site-output/ /usr/share/nginx/html/

# Copy custom nginx config
COPY --chown=nginx:nginx nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
