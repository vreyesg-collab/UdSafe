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

class ResultadoAcceso(str, Enum):
    pendiente = "pendiente"
    permitido = "permitido"
    denegado  = "denegado"

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

class Personal(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    codigo_institucional: str
    nombre: str
    tipo: TipoPersonal

class ValidarAccesoResponse(BaseModel):
    id: UUID
    codigo_institucional: str
    nombre: str
    tipo: str

class RegistrarAccesoRequest(BaseModel):
    codigo_institucional: str
    modalidad: Modalidad
    resultado: ResultadoAcceso = ResultadoAcceso.pendiente
    observacion: Optional[str] = None

class Acceso(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    id_personal: UUID
    id_vigilante: UUID
    modalidad: str
    observacion: Optional[str] = None
    tipo_acceso: str
    resultado: ResultadoAcceso = ResultadoAcceso.pendiente
    id_jefe_validador: Optional[UUID] = None
    fecha_validacion: Optional[datetime] = None
    fecha_hora: datetime = Field(default_factory=datetime.utcnow)

class Alerta(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    id_emisor: UUID
    asunto: str
    descripcion: str
    fecha_hora: datetime = Field(default_factory=datetime.utcnow)
    estado: str = EstadoAlerta

class BiometriaStatusResponse(BaseModel):
    tiene_biometria: bool
    id_personal: UUID
    foto_referencia: Optional[str] = None

class EnrollBiometriaResponse(BaseModel):
    id: UUID
    id_personal: UUID
    foto_referencia: str
    created_at: datetime

class VerificarBiometriaResponse(BaseModel):
    id_personal: UUID
    codigo_institucional: str
    nombre: str
    tipo: str
    distancia: float

class StatsHoyResponse(BaseModel):
    autorizados: int
    denegados: int
    alertas: int

# ------- HTTP Request/Response Models -----------------------

class RegistroVigilanteRequest(BaseModel):
    cedula:   str
    correo:   EmailStr
    nombre:   str
    password: str


class RegistroJefeRequest(BaseModel):
    cedula:   str
    correo:   EmailStr
    nombre:   str
    password: str
    telefono: str


class LoginRequest(BaseModel):
    correo:   str
    password: str


class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str          # Supabase siempre lo retorna
    token_type:    str = "bearer"
    rol:           str
    usuario_id:    str
    nombre:        str


# ── Acceso Especial (Visitantes) ──────────────────────────────────────────────

class CrearSolicitudEspecialRequest(BaseModel):
    nombre_visitante: str
    cedula_visitante: str
    motivo: str
    porteria: str = "Principal"


class DecisionSolicitudRequest(BaseModel):
    decision: str  # "aprobada" | "denegada"
    vigencia: Optional[str] = None  # "solo_hoy" | "esta_semana" | "permanente"
    observacion: Optional[str] = None

#--- Alertas ---------
class CrearAlertaRequest(BaseModel):
    asunto: str
    descripcion: str

class AlertaResponse(BaseModel):
    id: str
    id_emisor: str
    nombre_emisor: Optional[str]
    asunto: str
    observaciones: Optional[str]
    estado: str
    fecha_hora: str
