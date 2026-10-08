from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    app_name: str = "DrowsiGuard API"
    secret_key: str = "dev-secret-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    database_url: str = f"sqlite:///{BACKEND_DIR / 'drowsiguard.db'}"
    cors_origins: str = "http://localhost:5173"

    model_path: Path | None = None
    feature_spec_path: Path = REPO_ROOT / "ml" / "feature_spec.json"

    # Phone-call escalation (Twilio). Empty → simulated mode.
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    escalation_cooldown_seconds: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def twilio_configured(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number)

    @property
    def resolved_model_path(self) -> Path:
        """MODEL_PATH if set, else the model deployed to the frontend."""
        if self.model_path:
            return self.model_path
        # Same artifact the web app serves, so browser and server predictions agree.
        return REPO_ROOT / "frontend" / "public" / "models" / "drowsiness_model.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
