FROM python:3.12-slim
WORKDIR /srv/backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# R for the Insights page (r/insights.R)
RUN apt-get update && apt-get install -y --no-install-recommends r-base r-cran-dbi r-cran-rsqlite \
      r-cran-dplyr r-cran-ggplot2 r-cran-jsonlite && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY ml/feature_spec.json /srv/ml/feature_spec.json
COPY frontend /srv/frontend
COPY r /srv/r
ENV FEATURE_SPEC_PATH=/srv/ml/feature_spec.json \
    FRONTEND_DIR=/srv/frontend \
    R_SCRIPT=/srv/r/insights.R \
    DATABASE_URL=sqlite:////data/drowsiguard.db
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
