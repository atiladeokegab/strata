smoke:
	uv run pytest -q
web:
	cd web && npm run build
dev:
	uv run uvicorn server.main:app --reload --port 8090
deploy:
	gcloud run deploy strata --source . --region europe-west2 --project hackathon-starter-ao --max-instances 2 --min-instances 1 --memory 2Gi --cpu 2 --timeout 300 --allow-unauthenticated $(if $(OPENAI_API_KEY),--set-env-vars OPENAI_API_KEY=$(OPENAI_API_KEY),)
