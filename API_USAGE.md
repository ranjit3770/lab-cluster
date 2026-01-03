# 🚀 SLURM Job Submission API - Usage Guide

**Base URL**: `http://localhost:9000/slurm-job/v1`

---

## 1️⃣ Submit a Job (Explicit Files)
**Endpoint**: `POST /jobs`
**Content-Type**: `multipart/form-data`
**Response**: Streamed Plain Text Logs.

### Required Fields:
*   `user_id`: ID of the user (e.g., "user_123")
*   `username`: Name of the user (e.g., "john_doe")
*   `main_script`: The Python script (`.py`) to execute.

### Optional Fields:
*   `requirements_file`: A `requirements.txt` file for dependencies.
*   `dependency_path`: A direct server path containing extra inputs/modules (will be copied to job dir).

### Curl Command
```bash
# Create dummy files
echo "print('Hello SLURM')" > main.py
echo "requests" > requirements.txt

# Submit
curl -X POST "http://localhost:9000/slurm-job/v1/jobs" \
  -F "user_id=user_123" \
  -F "username=john_doe" \
  -F "main_script=@main.py" \
  -F "requirements_file=@requirements.txt" \
  -F "dependency_path=/path/to/server/data" \
  --no-buffer
```

---

## 2️⃣ Check Job Status
**Endpoint**: `GET /jobs/{job_id}`

### Curl Command
```bash
curl "http://localhost:9000/slurm-job/v1/jobs/1"
```

---

## 3️⃣ Stream Job Logs
**Endpoint**: `GET /jobs/{job_id}/logs`

### Curl Command
```bash
curl -N "http://localhost:9000/slurm-job/v1/jobs/1/logs"
```

---

## 4️⃣ Cancel a Job
**Endpoint**: `DELETE /jobs/{job_id}`

### Curl Command
```bash
curl -X DELETE "http://localhost:9000/slurm-job/v1/jobs/1?user_id=user_123"
```
