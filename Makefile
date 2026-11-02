comma := ,
.PHONY: smoke check-web check-design web dev deploy
smoke:
	uv run pytest -q
	$(MAKE) check-web
	$(MAKE) web
	$(MAKE) check-design
# The web self-checks: docent stream parsing, bare-earth ground, and the bridge logic incl. the road-corridor guard, and the metre UVs.
check-web:
	cd web && node --test src/lib/docentStream.test.js src/tour/guide.test.js src/scene/google/watch.test.js src/scene/google/load.test.js && node src/scene/bareEarth.check.mjs && node src/scene/bridge/check.mjs && node src/scene/look/uvs.check.mjs
web:
	cd web && npm run build

# The design gate (DESIGN.md, Impeccable 0.1.18 pinned): tokens in step with DESIGN.md, the source and the running
# page clean at both judge sizes, the copy clean, the brand page in step. Scans DEV_URL, or serves web/dist itself.
IMPECCABLE_DIR ?= $(HOME)/.local/share/impeccable/0.1.18
IMPECCABLE := DO_NOT_TRACK=1 $(IMPECCABLE_DIR)/impeccable
DESIGN_PORT ?= 8099
DEV_URL ?=
check-design:
	cd $(IMPECCABLE_DIR) && sha256sum -c --quiet impeccable.sha256
	node scripts/tokens-from-design.mjs --check DESIGN.md web/src/tokens.css
	$(IMPECCABLE) detect --json web/src/ < /dev/null > .impeccable/detect-src.json; test $$? -ne 1
	node scripts/check-detect.mjs .impeccable/detect-src.json
	node scripts/check-copy.mjs web/src/
	node scripts/brand-from-design.mjs --check DESIGN.md docs/brand.html
	$(IMPECCABLE) detect --json docs/brand.html < /dev/null > .impeccable/detect-brand.json; test $$? -ne 1
	node scripts/check-detect.mjs .impeccable/detect-brand.json
	@set -e; url='$(DEV_URL)'; \
	if [ -z "$$url" ]; then url=http://127.0.0.1:$(DESIGN_PORT)/; uv run uvicorn server.main:app --port $(DESIGN_PORT) > .impeccable/design-server.log 2>&1 & srv=$$!; \
	  trap "kill $$srv" EXIT; for i in $$(seq 60); do curl -sf -o /dev/null --max-time 3 $$url && break; sleep 1; done; fi; \
	for s in 1280x633 390x757; do \
	  scripts/detect-url.sh "$$url" $$s $${HOME_WAIT:-25} .impeccable/detect-url-home-$$s.json || test $$? -ne 1; \
	  node scripts/check-detect.mjs .impeccable/detect-url-home-$$s.json; \
	  scripts/detect-url.sh "$$url?capture=1" $$s $${APP_WAIT:-90} .impeccable/detect-url-app-$$s.json || test $$? -ne 1; \
	  node scripts/check-detect.mjs .impeccable/detect-url-app-$$s.json; \
	done
dev:
	uv run uvicorn server.main:app --reload --port 8090
deploy:
	@gcloud run deploy strata --source . --region europe-west2 --project hackathon-starter-ao --max-instances 2 --min-instances 1 --memory 2Gi --cpu 2 --timeout 300 --allow-unauthenticated $(if $(OPENAI_API_KEY),--set-env-vars OPENAI_API_KEY=$(OPENAI_API_KEY)$(if $(GOOGLE_TILES_KEY),$(comma)GOOGLE_TILES_KEY=$(GOOGLE_TILES_KEY)),)
