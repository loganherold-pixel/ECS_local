PYTHON ?= python
COMPOSE ?= docker compose

API_DIR := apps/api
WEB_DIR := apps/web

.PHONY: install dev test lint migrate format

install:
	$(PYTHON) -m pip install -e "$(API_DIR)[dev]"
	npm install --prefix $(WEB_DIR)

dev:
	$(COMPOSE) up db api web

test:
	$(PYTHON) -m pytest $(API_DIR)/tests -q
	npm --prefix $(WEB_DIR) run test:run

lint:
	$(PYTHON) -m ruff check $(API_DIR)
	npm --prefix $(WEB_DIR) run lint

migrate:
	cd $(API_DIR) && alembic upgrade head

format:
	$(PYTHON) -m ruff format $(API_DIR)
	npm --prefix $(WEB_DIR) run format
