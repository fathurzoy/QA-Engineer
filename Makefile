.PHONY: up down logs build

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f qa-engineer

build:
	docker compose build
