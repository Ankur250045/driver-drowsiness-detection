import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import alerts, analytics, auth, datasets, insights, predictions, users
from app.database.session import init_db
from app.services.ml_service import get_model, load_model
from app.utils.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    load_model(settings.resolved_model_path)
    yield


app = FastAPI(
    title=settings.app_name,
    version="3.0.0",
    description="Backend for the Driver Drowsiness Detection project: login, driver profiles, "
    "drowsiness prediction, session history, training data, smartwatch / phone-call alerts and R insights.",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    users.router,
    predictions.router,
    analytics.router,
    datasets.router,
    alerts.router,
    insights.router,
):
    app.include_router(router, prefix="/api")


@app.middleware("http")
async def revalidate_static_files(request, call_next):
    # Make browsers check for a newer HTML/CSS/JS file on every load (cheap 304 if unchanged),
    # so edits to the website show up without a hard refresh.
    response = await call_next(request)
    if not request.url.path.startswith("/api"):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    a = get_model().artifact
    return {
        "status": "ok",
        "model": {"name": a.name, "version": a.version, "trained": a.trained},
        "escalation_provider": "twilio" if settings.twilio_configured else "simulated",
    }


# The website (plain HTML/CSS/JS) — mounted last so /api/* routes take priority.
if settings.frontend_dir.exists():
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
