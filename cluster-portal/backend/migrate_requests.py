import sqlalchemy as sa
from urllib.parse import quote_plus
import sys

# DATABASE CONFIGURATION
MYSQL_USER = "root"
MYSQL_PASSWORD = quote_plus("Amma@123")
MYSQL_SERVER = "localhost"
MYSQL_PORT = "3307"
MYSQL_DB = "strach_portal"

# Try different connection strings based on available drivers
DRIVERS = [
    "mysql+mysqlconnector",
    "mysql+pymysql",
    "mysql+mysqldb"
]

def update_schema():
    print(f"\n--- Resource Pipeline Migration Script ---")
    print(f"Targeting Database: {MYSQL_DB} on {MYSQL_SERVER}")
    
    success = False
    for driver in DRIVERS:
        DATABASE_URL = f"{driver}://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_SERVER}:{MYSQL_PORT}/{MYSQL_DB}"
        print(f"Attempting connection with driver: {driver}...")
        
        try:
            engine = sa.create_engine(DATABASE_URL)
            inspector = sa.inspect(engine)
            
            if 'requests' not in inspector.get_table_names():
                print(f"CRITICAL: Table 'requests' does not exist. Initial data setup may be missing.")
                return

            columns = [c['name'] for c in inspector.get_columns('requests')]
            
            with engine.begin() as conn:
                # Add/Update columns
                new_columns = {
                    'cpu_cores': "INTEGER NULL DEFAULT 0",
                    'ram_gb': "INTEGER NULL DEFAULT 0",
                    'storage_gb': "INTEGER NULL DEFAULT 0"
                }
                
                for col, col_type in new_columns.items():
                    if col not in columns:
                        print(f"   [+] Adding column '{col}' to 'requests' table...")
                        conn.execute(sa.text(f"ALTER TABLE requests ADD COLUMN {col} {col_type}"))
                    else:
                        print(f"   [ ] Column '{col}' already exists.")
                
                # Structural Cleanup: Remove redundant columns
                obsolete_columns = ['title', 'description']
                for col in obsolete_columns:
                    if col in columns:
                        print(f"   [-] Dropping obsolete column '{col}' from 'requests' table...")
                        # Warning: In production use cautious migration for dropping columns
                        conn.execute(sa.text(f"ALTER TABLE requests DROP COLUMN {col}"))
                    else:
                        print(f"   [ ] Obsolete column '{col}' already removed or doesn't exist.")

            print(f"SUCCESS: Database schema updated via {driver}.")
            success = True
            break # Exit on first successful driver
            
        except ImportError:
            print(f"   [!] Driver {driver} not installed in this environment.")
            continue
        except Exception as e:
            print(f"   [!] Error with {driver}: {e}")
            continue

    if not success:
        print("\n" + "!"*60)
        print("MIGRATION FAILED: No compatible MySQL drivers found.")
        print("Please install one of the following to proceed:")
        print("1. pip install mysql-connector-python  (Recommended)")
        print("2. pip install pymysql")
        print("!"*60 + "\n")
        sys.exit(1)

if __name__ == "__main__":
    update_schema()
