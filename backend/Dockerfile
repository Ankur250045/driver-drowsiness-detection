FROM python:3.12-slim
WORKDIR /srv/backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
# Feature contract + deployed model live outside backend/
COPY ml/feature_spec.json /srv/ml/feature_spec.json
COPY frontend/public/models /srv/frontend/public/models
ENV FEATURE_SPEC_PATH=/srv/ml/feature_spec.json \
    MODEL_PATH=/srv/frontend/public/models/drowsiness_model.json \
    DATABASE_URL=sqlite:////data/drowsiguard.db
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
