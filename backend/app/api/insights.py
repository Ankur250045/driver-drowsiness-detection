"""R-generated insights (r/insights.R).

The R script reads the SQLite database, makes ggplot2 charts and runs a few
statistical tests, and writes PNGs + summary.json into frontend/insights/.
This router lets the Insights page read that output and re-run the script.
"""

import json
import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser
from app.utils.config import get_settings

router = APIRouter(prefix="/insights", tags=["insights"])


def _db_file() -> Path:
    url = get_settings().database_url
    if not url.startswith("sqlite:///"):
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "R insights currently read the SQLite database only")
    return Path(url.removeprefix("sqlite:///")).resolve()


@router.get("")
def get_insights(_: CurrentUser) -> dict:
    settings = get_settings()
    summary_file = settings.insights_dir / "summary.json"
    rscript = shutil.which(settings.rscript_path)
    if not summary_file.exists():
        return {"available": False, "r_installed": rscript is not None}
    summary = json.loads(summary_file.read_text(encoding="utf-8"))
    return {"available": True, "r_installed": rscript is not None, **summary}


@router.post("/run")
def run_insights(_: CurrentUser) -> dict:
    settings = get_settings()
    rscript = shutil.which(settings.rscript_path)
    if not rscript:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "R is not installed (Rscript not found). Install R from https://cran.r-project.org "
            "or set RSCRIPT_PATH in backend/.env.",
        )
    settings.insights_dir.mkdir(parents=True, exist_ok=True)
    try:
        proc = subprocess.run(
            [rscript, str(settings.r_script), str(_db_file()), str(settings.insights_dir)],
            capture_output=True,
            text=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired as e:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "R script took longer than 3 minutes") from e
    if proc.returncode != 0:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"R script failed:\n{proc.stderr[-2000:]}")
    return get_insights(_)
