FROM python:3.10-slim

# System Utilities (Job-API needs sbatch/scontrol)
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

# Copy Job-API application
COPY . .

# Environment Defaults for Job-API
ENV MYSQL_SERVER=localhost
ENV MYSQL_PORT=3306
ENV DATA_ROOT=/data_storage

# Job-API expoases on 9000
EXPOSE 9000

# Start script
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
