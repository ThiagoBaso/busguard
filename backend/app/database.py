import pymysql


def get_connection():
    return pymysql.connect(
        host="mysql",
        user="app_user",
        password="app_password",
        database="app_db",
        cursorclass=pymysql.cursors.DictCursor
    )