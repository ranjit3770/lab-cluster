from sqlalchemy import create_url, create_engine, text
from app.core.config import settings

def update_quotas():
    # Use the same logic as config.py to build the URI
    from urllib.parse import quote_plus
    password = quote_plus(settings.MYSQL_PASSWORD)
    db_url = f"mysql+mysqlconnector://{settings.MYSQL_USER}:{password}@{settings.MYSQL_SERVER}:{settings.MYSQL_PORT}/{settings.MYSQL_DB}"
    
    engine = create_engine(db_url)
    with engine.connect() as conn:
        print("Updating existing users to 15GB quota...")
        result = conn.execute(text("UPDATE users SET storage_limit_gb = 15 WHERE storage_limit_gb = 10 OR storage_limit_gb IS NULL"))
        conn.commit()
        print(f"Successfully updated {result.rowcount} users.")

if __name__ == "__main__":
    try:
        update_quotas()
    except Exception as e:
        print(f"Error updating quotas: {e}")
