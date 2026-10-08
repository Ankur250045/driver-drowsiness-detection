import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import alerts, analytics, auth, datasets, predictions, users
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
    version="2.0.0",
    description="Backend for DrowsiGuard AI: authentication, drowsiness prediction, "
    "session analytics, training-data collection and phone-call alert escalation.",
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

for router in (auth.router, users.router, predictions.router, analytics.router, datasets.router, alerts.router):
    app.include_router(router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    a = get_model().artifact
    return {
        "status": "ok",
        "model": {"name": a.name, "version": a.version, "trained": a.trained},
        "escalation_provider": "twilio" if settings.twilio_configured else "simulated",
    }
