import logging

import pymysql
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.database import get_connection
from app.security import verify_password, create_access_token

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


class LoginRequest(BaseModel):
    email: str
    password: str


def invalid_credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={
            "WWW-Authenticate": "Bearer"
        }
    )


@router.post("/login")
def login(data: LoginRequest):

    connection = None

    try:
        connection = get_connection()

        with connection.cursor() as cursor:

            sql = """
                SELECT id, password_hash, role
                FROM users
                WHERE email = %s
            """

            cursor.execute(sql, (data.email,))
            user = cursor.fetchone()

            if not user:
                raise invalid_credentials_exception()

            if not verify_password(
                data.password,
                user["password_hash"]
            ):
                raise invalid_credentials_exception()

            token = create_access_token(
                user_id=user["id"],
                role=user["role"]
            )

            return {
                "access_token": token,
                "token_type": "bearer"
            }

    except HTTPException:
        raise

    except pymysql.MySQLError:
        logger.exception("Database error during login")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )

    except RuntimeError:
        logger.exception("Authentication configuration error during login")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service is not configured"
        )

    except Exception:
        logger.exception("Unexpected authentication error during login")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected authentication error"
        )

    finally:
        if connection:
            connection.close()
