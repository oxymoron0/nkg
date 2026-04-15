# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS builder
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts index.html ./
COPY src ./src

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=builder /src/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV NKG_API_HOST=nkg-api:8080
ENV NGINX_ENVSUBST_FILTER_VARIABLES=NKG_API_HOST

EXPOSE 8080
