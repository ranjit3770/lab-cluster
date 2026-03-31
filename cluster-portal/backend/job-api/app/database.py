import mysql.connector
from app.config import MYSQL_CONFIG

def get_db():
    return mysql.connector.connect(**MYSQL_CONFIG)
