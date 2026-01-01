# 🚀 API Usage Guide & Curl Commands (Updated)

**Base URL**: `http://localhost:8000/api/v1`

---

## 1️⃣ Submit a Job (Zip Upload)
**Endpoint**: `POST /jobs`
**Content-Type**: `multipart/form-data`
**Response**: Streamed Plain Text Logs.

### Prepare Project Folder
```bash
# Create a folder with your script and dependencies
mkdir my_project
echo "print('Hello SLURM')" > my_project/main.py
echo "requests" > my_project/requirements.txt
zip -r my_project.zip my_project
```

### Curl Command
```bash
curl -X POST "http://localhost:8000/api/v1/jobs" \
  -F "user_id=user_123" \
  -F "project_folder=@my_project.zip" \
  --no-buffer
```

### Expected Output (Streamed Plain Text)
```text
Status: Starting Submission...
Status: Validating User Quota...
Status: Job Record Created (ID: 1)
Status: Setting up User Environment...
Status: extracting project files to /var/lib/job-exec/users/user_123/jobs/1...
Status: Discovering dependencies and scripts...
Status: Discovered entry script: main.py
Status: Installing dependencies...
Status: Generating SLURM script...
Status: Submitting to SLURM Cluster...
Status: Submitted Successfully! SLURM Job ID: 1001
Status: Enforcing Cgroup I/O Limits...
Status: Job 1 Fully Accepted and Running.
```

---

## 2️⃣ Check Job Status
**Endpoint**: `GET /jobs/{job_id}`

### Curl Command
```bash
curl "http://localhost:8000/api/v1/jobs/1"
```

### Expected Output
```json
{
  "id": 1,
  "user_id": "user_123",
  "slurm_job_id": 1001,
  "status": "RUNNING",
  "script_path": "main.py"
}
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
