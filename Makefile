smoke:
	uv run pytest -q
web:
	cd web && npm run build
dev:
	uv run uvicorn server.main:app --reload --port 8090
