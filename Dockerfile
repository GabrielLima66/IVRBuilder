# --- Estágio 1: build ---
FROM node:24-alpine AS build
WORKDIR /app

# Instala dependências (camada cacheada enquanto package*.json não muda)
COPY package*.json ./
RUN npm ci

# Builda o app (gera dist/)
COPY . .
RUN npm run build

# --- Estágio 2: serve estático ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
