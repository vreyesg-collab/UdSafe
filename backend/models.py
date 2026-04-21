from pydantic import BaseModel
from typing import Optional, EmailStr
from datetime import datetime 

class Vigilante(BaseModel):
    id:  str
    cedula: str 
    name: str
    email: Optional [EmailStr]

class UserLoging(BaseModel):
    email: str
    password: str 

class Jefe_de_Seguridad(BaseModel):
    id:  str
    cedula: str 
    name: str
    email: Optional [EmailStr]
    telefono: Optional [str]

class Alerta(BaseModel):
    id: str
    asunto: str
    id_emisor: str
    estado: str
    fecha_hora: datetime
    observaciones: Optional [str]

class RegistroRequest(BaseModel):
    email: EmailStr
    password: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "email":    "usuario@empresa.com",
                "password": "MiClave$egura123"
            }
        }
    }
    
 
class RegistroResponse(BaseModel):
    id:         int
    email:      EmailStr
    created_at: datetime
 
 
class LoginRequest(BaseModel):
    email:    EmailStr
    password: str
 
    model_config = {
        "json_schema_extra": {
            "example": {
                "email":    "usuario@empresa.com",
                "password": "MiClave$egura123"
            }
        }
    }
 
 
class LoginResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    expires_in:   int          # segundos
 
 