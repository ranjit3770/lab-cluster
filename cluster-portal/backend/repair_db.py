import sqlalchemy as sa
from urllib.parse import quote_plus

# Database configuration (Hardcoded briefly for the repair script to ensure it works independent of app structure issues)
MYSQL_USER = "root"
MYSQL_PASSWORD = quote_plus("Amma@123")
MYSQL_SERVER = "localhost"
MYSQL_PORT = "3307"
MYSQL_DB = "strach_portal"

DATABASE_URL = f"mysql+mysqlconnector://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_SERVER}:{MYSQL_PORT}/{MYSQL_DB}"

def repair():
    print(f"Connecting to {MYSQL_DB}...")
    engine = sa.create_engine(DATABASE_URL)
    
    inspector = sa.inspect(engine)
    if 'nodes' not in inspector.get_table_names():
        print("Table 'nodes' does not exist. Please run initial_data.py first.")
        return

    columns = [c['name'] for c in inspector.get_columns('nodes')]
    
    with engine.begin() as conn:
        # Add Node columns
        for col in ['cpu_total', 'cpu_used', 'memory_total_mb', 'memory_used_mb', 'gpu_total', 'gpu_used']:
            if col not in columns:
                print(f"Adding column '{col}' to 'nodes' table...")
                conn.execute(sa.text(f"ALTER TABLE nodes ADD COLUMN {col} INTEGER DEFAULT 0"))

        # Add ClusterHealth table if missing
        if 'cluster_health' not in inspector.get_table_names():
            print("Creating 'cluster_health' table...")
            conn.execute(sa.text("""
                CREATE TABLE cluster_health (
                    id INTEGER NOT NULL AUTO_INCREMENT, 
                    slurmctld_status VARCHAR(50), 
                    slurmdbd_status VARCHAR(50), 
                    cluster_status VARCHAR(50), 
                    last_heartbeat DATETIME, 
                    updated_at DATETIME, 
                    PRIMARY KEY (id)
                )
            """))

        # Add updated_at to jobs if missing
        job_columns = [c['name'] for c in inspector.get_columns('jobs')]
        if 'updated_at' not in job_columns:
            print("Adding 'updated_at' to 'jobs' table...")
            conn.execute(sa.text("ALTER TABLE jobs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))

    print("Database repair complete. Please restart your uvicorn server.")

if __name__ == "__main__":
    repair()
