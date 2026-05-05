FROM python:3.10-slim

# System Utilities (Required for OS Orchestration & Slurm access)
RUN apt-get update && apt-get install -y \
    sudo \
    mariadb-client \
    slurm-client \
    libmunge-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY . .

# Environment Defaults
ENV MYSQL_SERVER=localhost
ENV MYSQL_PORT=3306
ENV DATA_STORAGE=/data_storage

# Portal exposes API on 8000
EXPOSE 8000

# Start script should ensure DB is initialized
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
