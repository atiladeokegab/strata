comma := ,
.PHONY: smoke check-web web dev deploy
smoke:
	uv run pytest -q
	$(MAKE) check-web
# The web self-checks: docent stream parsing, bare-earth ground, and the bridge logic incl. the road-corridor guard, and the metre UVs.
check-web:
	cd web && node --test src/lib/docentStream.test.js src/tour/guide.test.js src/tour/tour.test.js src/scene/google/watch.test.js src/scene/google/load.test.js && node src/scene/bareEarth.check.mjs && node src/scene/bridge/check.mjs && node src/scene/look/uvs.check.mjs
web:
	cd web && npm run build
dev:
	uv run uvicorn server.main:app --reload --port 8090
deploy:
	@gcloud run deploy strata --source . --region europe-west2 --project hackathon-starter-ao --max-instances 2 --min-instances 1 --memory 2Gi --cpu 2 --timeout 300 --allow-unauthenticated $(if $(OPENAI_API_KEY),--set-env-vars OPENAI_API_KEY=$(OPENAI_API_KEY)$(if $(GOOGLE_TILES_KEY),$(comma)GOOGLE_TILES_KEY=$(GOOGLE_TILES_KEY)),)
