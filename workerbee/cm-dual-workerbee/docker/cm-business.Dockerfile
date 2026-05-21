# syntax=docker/dockerfile:1.6

FROM nginxinc/nginx-unprivileged:alpine AS dev

COPY --chown=nginx:nginx business-site/site-output/cosmos-test/ /usr/share/nginx/html/
COPY --chown=nginx:nginx .local/workerbee/cm-dual-workerbee/nginx/cm-business.default.conf /etc/nginx/conf.d/default.conf

USER 101:101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
