from fastapi import FastAPI
from models import RegistroRequest, RegistroResponse, LoginRequest, LoginResponse
from datetime import datetime, timedelta
from typing import Optional
 
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt
import databases
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)
 
 
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)
 
 
def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=TOKEN_EXPIRE_MINUTES))
    payload = {"sub": subject, "exp": expire, "iat": datetime.utcnow()}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

@app.get("/")
def read_root():
    return {"Saludo": "Hola Mundo"}


@app.post(
    "/registro",
    response_model=RegistroResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar nuevo usuario",
)
async def registro(body: RegistroRequest):
    """
    Crea una cuenta nueva en `user_logins`.
 
    - Verifica que el email no esté ya registrado.
    - Hashea la contraseña con bcrypt antes de persistirla.
    - Devuelve el usuario creado (sin contraseña).
    """
    # 1. Verificar si el email ya existe
    check_query = "SELECT id FROM user_logins WHERE email = :email"
    existing = await database.fetch_one(query=check_query, values={"email": body.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El email ya está registrado.",
        )
 
    # 2. Hashear contraseña e insertar
    hashed = hash_password(body.password)
    insert_query = """
        INSERT INTO user_logins (email, password_hash)
        VALUES (:email, :password_hash)
        RETURNING id, email, created_at
    """
    row = await database.fetch_one(
        query=insert_query,
        values={"email": body.email, "password_hash": hashed},
    )
 
    return RegistroResponse(**dict(row))
 
 
@app.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Iniciar sesión",
)
async def login(body: LoginRequest):
    """
    Autentica al usuario y devuelve un JWT.
 
    - Busca el usuario por email.
    - Verifica la contraseña contra el hash almacenado.
    - Genera y devuelve un token JWT con expiración configurable.
    """
    # 1. Buscar usuario
    query = "SELECT id, email, password_hash FROM user_logins WHERE email = :email"
    user = await database.fetch_one(query=query, values={"email": body.email})
 
    # Mismo mensaje para email y contraseña incorrectos (evita enumeración de usuarios)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas.",
            headers={"WWW-Authenticate": "Bearer"},
        )
 
    # 2. Generar token
    expire_delta = timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    token = create_access_token(subject=str(user["id"]), expires_delta=expire_delta)
 
    return LoginResponse(
        access_token=token,
        expires_in=int(expire_delta.total_seconds()),
    )