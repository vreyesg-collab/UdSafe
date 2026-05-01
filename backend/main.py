from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from database import supabase 
from models import *
from auth import get_current_user, require_jefe

app = FastAPI(
    title="UdSafe API",
    description="API para la aplicación UdSafe, control integral de acceso para la universidad de cartagena",
    version="1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permitir todas las fuentes (ajustar según sea necesario)
    allow_methods=["*"],  # Permitir todos los métodos HTTP
    allow_headers=["*"],  # Permitir todos los encabezados
)

@app.get("/", tags=["Saludo"])
def read_root():
    return {"Saludo": "Hola, todo ok"}

# Autenticación (Login/Regis): ----------------------------------------------------------------------------------------------------


@app.post("/registro/vigilante",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenResponse,
)
def registrar_vigilante(data: RegistroVigilanteRequest):
 
    # 1. Crear en Supabase Auth (guarda el rol en user_metadata)
    try:
        auth_resp = supabase.auth.sign_up({
            "email":    data.correo,
            "password": data.password,
            "options":  {"data": {"rol": "vigilante", "nombre": data.nombre}},
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
 
    if not auth_resp.user:
        raise HTTPException(status_code=400, detail="No se pudo crear el usuario")
 
    uid = auth_resp.user.id
 
    # 2. Insertar en tus tablas
    supabase.table("usuarios").insert({
        "id": uid, "cedula": data.cedula,
        "correo": data.correo, "nombre": data.nombre,
    }).execute()
 
    supabase.table("vigilantes").insert({
        "id": uid, "turno": data.turno,
    }).execute()
 
    # 3. Retornar el JWT que Supabase ya generó
    session = auth_resp.session
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        rol="vigilante",
        usuario_id=uid,
        nombre=data.nombre,
    )
 
 
#  POST /auth/registro/jefe 
 
@app.post(
    "/auth/registro/jefe",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenResponse,
    summary="Registrar un jefe de seguridad",
)
def registrar_jefe(data: RegistroJefeRequest):
 
    try:
        auth_resp = supabase.auth.sign_up({
            "email":    data.correo,
            "password": data.password,
            "options":  {"data": {"rol": "jefe_seguridad", "nombre": data   .nombre}},
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
 
    if not auth_resp.user:
        raise HTTPException(status_code=400, detail="No se pudo crear el usuario")
 
    uid = auth_resp.user.id
 
    supabase.table("usuarios").insert({
        "id": uid, "cedula": data.cedula,
        "correo": data.correo, "nombre": data.nombre,
    }).execute()
 
    supabase.table("jefes_seguridad").insert({
        "id": uid, "telefono": data.telefono,
    }).execute()
 
    session = auth_resp.session
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        rol="jefe_seguridad",
        usuario_id=uid,
        nombre=data.nombre,
    )
 
 
# POST /auth/login 
 
@app.post(
    "/auth/login",
    response_model=TokenResponse,
    summary="Iniciar sesión",
)
def login(data: LoginRequest):
 
    try:
        auth_resp = supabase.auth.sign_in_with_password({
            "email": data.correo, "password": data.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
 
    user    = auth_resp.user
    session = auth_resp.session
    nombre  = user.user_metadata.get("nombre", "")
    rol     = user.user_metadata.get("rol", "vigilante")
 
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        rol=rol,
        usuario_id=user.id,
        nombre=nombre,
    )
 
 
# POST /auth/refresh
 
@app.post(
    "/auth/refresh",
    response_model=TokenResponse,
    summary="Renovar token con refresh_token",
)
def refresh(refresh_token: str):
 
    try:
        auth_resp = supabase.auth.refresh_session(refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Refresh token inválido o expirado")
 
    user    = auth_resp.user
    session = auth_resp.session
    nombre  = user.user_metadata.get("nombre", "")
    rol     = user.user_metadata.get("rol", "vigilante")
 
    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        rol=rol,
        usuario_id=user.id,
        nombre=nombre,
    )
 
 
# POST /auth/logout 
 
@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Cerrar sesión")
def logout(current_user=Depends(get_current_user)):
    supabase.auth.sign_out()
 
 
# GET /auth/me 
 
@app.get("/auth/me", summary="Datos del usuario autenticado")
def me(current_user=Depends(get_current_user)):
    return {
        "usuario_id": current_user.id,
        "correo":     current_user.email,
        "rol":        current_user.user_metadata.get("rol"),
        "nombre":     current_user.user_metadata.get("nombre"),
    }







