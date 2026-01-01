# 🚀 API Usage Guide & Curl Commands (Explicit Files)

**Base URL**: `http://localhost:8000/api/v1`

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
*   `dependency_zip`: A `.zip` file containing extra inputs/modules (will be extracted to job dir).

### Curl Command
```bash
# Create dummy files
echo "print('Hello SLURM')" > main.py
echo "requests" > requirements.txt
# Create a dummy dependency zip
mkdir data_folder
touch data_folder/input.csv
zip -r data.zip data_folder

# Submit
curl -X POST "http://localhost:8000/api/v1/jobs" \
  -F "user_id=user_123" \
  -F "username=john_doe" \
  -F "main_script=@main.py" \
  -F "requirements_file=@requirements.txt" \
  -F "dependency_zip=@data.zip" \
  --no-buffer
```

---

## 2️⃣ Check Job Status
**Endpoint**: `GET /jobs/{job_id}`

### Curl Command
```bash
curl "http://localhost:8000/api/v1/jobs/1"
```

---

## 3️⃣ Stream Job Logs
**Endpoint**: `GET /jobs/{job_id}/logs`

### Curl Command
```bash
curl -N "http://localhost:8000/api/v1/jobs/1/logs"
```

---

## 4️⃣ Cancel a Job
**Endpoint**: `DELETE /jobs/{job_id}`

### Curl Command
```bash
curl -X DELETE "http://localhost:8000/api/v1/jobs/1?user_id=user_123"
```
