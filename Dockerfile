FROM node:24-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.4 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY server/ server/
COPY data/ data/
COPY scripts/validate.py scripts/validate.py
COPY --from=web /web/dist web/dist
ENV PORT=8080
CMD ["sh", "-c", "uv run --no-sync uvicorn server.main:app --host 0.0.0.0 --port $PORT --forwarded-allow-ips '*' --proxy-headers"]
