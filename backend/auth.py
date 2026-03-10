import os
import string
import random
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-a-long-random-string")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(practitioner_id: str, role: str) -> str:
    payload = {
        "sub": practitioner_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


async def get_current_practitioner(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    from models import Practitioner
    payload = decode_token(creds.credentials)
    prac = await db.get(Practitioner, payload["sub"])
    if not prac or not prac.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found or deactivated")
    return prac


async def require_owner(
    prac=Depends(get_current_practitioner),
):
    if prac.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner access required")
    return prac


def generate_ref_code(length: int = 8) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=length))


def generate_resume_code(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))
