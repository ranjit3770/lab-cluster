from app.database import get_db

def insert_job_log(job_id: str, job):
    db = get_db()
    cur = db.cursor()

    cur.execute("""
        INSERT INTO job_logs (
            job_id, username, project_name, entry_point,
            total_cpu, total_ram, resource_mode, walltime,
            command_args, requirements_path, status
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        job_id,
        job.username,
        job.project_name,
        job.entry_point,
        job.total_cpu,
        job.total_ram,
        job.resource_mode,
        job.time,
        job.command_args,
        job.requirements_path,
        "SUBMITTED"
    ))

    db.commit()
    cur.close()
    db.close()


def update_job_status(job_id: str, status: str):
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "UPDATE job_logs SET status=%s WHERE job_id=%s",
        (status, job_id)
    )
    db.commit()
    cur.close()
    db.close()

def get_job_log_status(job_id: str):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT status FROM job_logs WHERE job_id=%s", (job_id,))
    row = cur.fetchone()
    cur.close()
    db.close()
    return row[0] if row else None
