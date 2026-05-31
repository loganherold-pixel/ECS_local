FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic

RUN pip install --no-cache-dir --disable-pip-version-check --root-user-action=ignore .

EXPOSE 8000

CMD ["uvicorn", "ecs_trails_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
