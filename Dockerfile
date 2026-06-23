# stage 1: build the frontend
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# stage 2: backend runtime
FROM python:3.12-slim AS app
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Backend source includes backend/data/gridlock.duckdb for the demo deploy.
COPY backend/ ./backend/
COPY --from=frontend /fe/dist ./frontend/dist

COPY backend/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app/backend
EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
