# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS builder
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts index.html ./
COPY eslint.config.js .prettierrc.json .prettierignore ./
COPY src ./src

# Notion workspace slug for the right-click context menu. Required — the
# build fails when unset or empty. Vite inlines VITE_* env vars into the
# bundle at build time.
#   docker build --build-arg VITE_NKG_NOTION_WORKSPACE=<slug> ...
ARG VITE_NKG_NOTION_WORKSPACE
ENV VITE_NKG_NOTION_WORKSPACE=${VITE_NKG_NOTION_WORKSPACE}

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=builder /src/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV NKG_API_HOST=nkg-api:8080
ENV NGINX_ENVSUBST_FILTER_VARIABLES=NKG_API_HOST

EXPOSE 8080
