# ---- build ----
FROM node:24.22-alpine AS build
WORKDIR /app
RUN npm i -g pnpm@10.34.9
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Tests validate every tax-year file; a bad file stops the deploy.
RUN pnpm test && pnpm build

# ---- serve ----
FROM nginx:1.31-alpine-slim
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
