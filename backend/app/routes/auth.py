from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.security import verify_password, create_access_token


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(data: LoginRequest):

    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            sql = """
                SELECT id, password_hash, role
                FROM users
                WHERE email = %s
            """

            cursor.execute(sql, (data.email,))
            user = cursor.fetchone()

            if not user:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid credentials"
                )

            if not verify_password(
                data.password,
                user["password_hash"]
            ):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid credentials"
                )

            token = create_access_token(
                user_id=user["id"],
                role=user["role"]
            )

            return {
                "access_token": token,
                "token_type": "bearer"
            }
        
    except:

        raise HTTPException(
            status_code=500,
            detail=str("Erro!")
        )

    finally:
        connection.close()
