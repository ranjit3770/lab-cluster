import logging
import urllib.parse
from sqlalchemy import create_engine, text

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    logger.info("Starting schema migration...")
    try:
        # Manual config to avoid import issues
        password = urllib.parse.quote_plus("Amma@123")
        # Force 127.0.0.1 to avoid localhost resolution issues on Windows
        uri = f"mysql+mysqlconnector://root:{password}@127.0.0.1:3307/strach_portal"
        
        # Create engine
        engine = create_engine(uri)
        
        with engine.connect() as connection:
            # Transaction for safety
            with connection.begin():
                # List of columns to add with their types and constraints
                columns_to_add = [
                    ("slurm_job_id", "VARCHAR(50) NULL"),
                    ("total_cpu", "INTEGER DEFAULT 1"),
                    ("total_ram", "INTEGER DEFAULT 1"),
                    ("resource_mode", "VARCHAR(20) DEFAULT 'node_wise'"),
                    ("walltime", "VARCHAR(20) DEFAULT '00:10:00'")
                ]

                for col_name, col_def in columns_to_add:
                    try:
                        logger.info(f"Attempting to add column '{col_name}'...")
                        connection.execute(text(f"ALTER TABLE jobs ADD COLUMN {col_name} {col_def}"))
                        logger.info(f"Successfully added column '{col_name}'.")
                    except Exception as e:
                        # 1060 is "Duplicate column name".
                        # Also handle generic OperationalError for duplicates if text matching fails
                        msg = str(e).lower()
                        if "duplicate column name" in msg or "1060" in msg:
                            logger.info(f"Column '{col_name}' already exists. Skipping.")
                        else:
                            raise e

        logger.info("Schema migration completed successfully.")
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        # print full traceback
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    migrate()
