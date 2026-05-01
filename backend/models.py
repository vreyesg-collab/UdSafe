from uuid import UUID, uuid4
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, EmailStr

#-- Enums ------------------------

class Modalidad(str, Enum):
    qr = "QR"
    manual = "Manual"
    biomdetrico = "Biometrico"

class TipoAcceso(str, Enum):
    normal = "Normal"
    especial = "Especial"

class TipoPersonal(str, Enum):
    visitante = "visitante"
    estudiante = "estudiante"
    servicios_generales = "servicios_generales"
    admin = "administrativo"
    docente = "docente"

class EstadoAlerta(str, Enum):
    activa = "Activa"
    resuelta = "Resuelta"

#------- Modelos ---------------------------------------

class Usuario(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    cedula: str
    nombre: str
    correo: EmailStr

class Vigilante(Usuario):
    turno: bool = False

class JefeSeguridad(Usuario):
    telefono: str

class Personal(Usuario):
    id: UUID = Field(default_factory=uuid4)
    nombre: str
    tipo_personal: TipoPersonal

class Acceso(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    id_personal: UUID
    id_vigilante: UUID
    modalidad: str
    observacion: Optional[str] = None
    tipo_acceso: str 
    fecha_hora: datetime = Field(default_factory=datetime.utcnow)

class Alerta(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    id_emisor: UUID
    asunto: str
    descripcion: str
    fecha_hora: datetime = Field(default_factory=datetime.utcnow)
    estado: str = EstadoAlerta

# ------- HTTP Request/Response Models -----------------------

class RegistroVigilanteRequest(BaseModel):
    cedula:   str
    correo:   EmailStr
    nombre:   str
    password: str
    turno:    bool = False


class RegistroJefeRequest(BaseModel):
    cedula:   str
    correo:   EmailStr
    nombre:   str
    password: str
    telefono: str


class LoginRequest(BaseModel):
    correo:   EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str          # Supabase siempre lo retorna
    token_type:    str = "bearer"
    rol:           str
    usuario_id:    str
    nombre:        str
