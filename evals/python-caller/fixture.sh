#!/bin/bash
set -e
mkdir -p "$(dirname 'pyproject.toml')"
cat > 'pyproject.toml' <<'__EOF__'
[project]
name = "ml-api"
version = "0.1.0"
dependencies = ["fastapi", "uvicorn", "requests"]
__EOF__
mkdir -p "$(dirname 'app/main.py')"
cat > 'app/main.py' <<'__EOF__'
from fastapi import FastAPI
app = FastAPI()

@app.post("/predict")
def predict(body: dict):
    return {"queued": False}
__EOF__
mkdir -p "$(dirname '.env.example')"
cat > '.env.example' <<'__EOF__'
TRIGGER_SECRET_KEY=

__EOF__
