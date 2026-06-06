from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form
import numpy as np
from datetime import datetime, timezone
from fastapi.middleware.cors import CORSMiddleware
from database import supabase, supabase_admin, SUPABASE_URL, SUPABASE_KEY
from supabase import create_client, ClientOptions
from models import *
from auth import get_current_user, require_jefe, require_enroll, security
from fastapi.security import HTTPAuthorizationCredentials

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
    email = data.correo.strip()
    if "@" not in email:
        try:
            resp = supabase.table("usuarios").select("correo").eq("cedula", email).execute()
            if resp.data and len(resp.data) > 0:
                email = resp.data[0]["correo"]
            else:
                raise HTTPException(status_code=401, detail="Cédula no registrada en el sistema")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al verificar la cédula: {str(e)}")

    try:
        auth_resp = supabase.auth.sign_in_with_password({
            "email": email, "password": data.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Correo, cédula o contraseña incorrectos")
 
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


# ── Biometría: helpers ──────────────────────────────────────────────────────

# Threshold ArcFace (insightface buffalo_sc) + coseno: distancia ≤ 0.50 → misma persona.
UMBRAL_BIOMETRICO = 0.50

_face_app = None


def _get_face_app():
    """Inicialización lazy del modelo ArcFace. Descarga ~100 MB la primera vez."""
    global _face_app
    if _face_app is None:
        from insightface.app import FaceAnalysis
        _face_app = FaceAnalysis(name="buffalo_sc", providers=["CPUExecutionProvider"])
        _face_app.prepare(ctx_id=0, det_size=(640, 640))
    return _face_app


def _extraer_embedding(imagen_bytes: bytes) -> list:
    """Extrae el vector ArcFace (512-float) del rostro principal de la imagen."""
    import cv2

    nparr = np.frombuffer(imagen_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="No se pudo decodificar la imagen.")

    app = _get_face_app()
    faces = app.get(img)

    if not faces:
        raise HTTPException(status_code=422, detail="No se detectó ningún rostro en la imagen.")

    return faces[0].embedding.tolist()


def _distancia_coseno(a: list, b: list) -> float:
    va, vb = np.array(a, dtype=float), np.array(b, dtype=float)
    norma = np.linalg.norm(va) * np.linalg.norm(vb)
    if norma == 0:
        return 1.0
    return float(1 - np.dot(va, vb) / norma)


# CONTROL DE ACCESO (Validación y Registro)

@app.get(
    "/acceso/validar/{codigo_institucional}",
    response_model=ValidarAccesoResponse,
    summary="Validar la existencia de personal por su código institucional",
)
def validar_acceso(codigo_institucional: str, current_user=Depends(get_current_user)):
    # Buscar el personal por su código institucional
    response = supabase.table("personal").select("*").eq("codigo_institucional", codigo_institucional).execute()
    
    personal_data = response.data[0]
    return ValidarAccesoResponse(
        id=personal_data["id"],
        codigo_institucional=personal_data["codigo_institucional"],
        nombre=personal_data["nombre"],
        tipo=personal_data["tipo"]
    )


@app.post(
    "/acceso/registrar",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar el ingreso/salida de personal",
)
def registrar_acceso(data: RegistrarAccesoRequest, current_user=Depends(get_current_user)):
    rol = current_user.user_metadata.get("rol")
    if rol != "vigilante":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los vigilantes están autorizados para registrar el acceso."
        )

    # 1. Buscar personal — no se lanza excepción si no existe: el acceso se
    #    registrará igualmente con resultado="denegado" e id_personal=NULL.
    personal_resp = supabase.table("personal").select("*").eq("codigo_institucional", data.codigo_institucional).execute()
    personal_data = personal_resp.data[0] if personal_resp.data else None

    if personal_data:
        personal_id = personal_data["id"]
        tipo_acceso = "Especial" if personal_data["tipo"].lower() == "visitante" else "Normal"
        resultado   = data.resultado.value
        observacion = data.observacion
    else:
        # Código desconocido: registrar el intento como denegado para auditoría.
        personal_id = None
        tipo_acceso = "Normal"
        resultado   = ResultadoAcceso.denegado.value
        observacion = f"Código no registrado: {data.codigo_institucional}"

    # 2. Insertar el registro de acceso (id_personal es nullable tras la migración).
    try:
        acceso_data = {
            "id_personal": personal_id,
            "id_vigilante": current_user.id,
            "modalidad": data.modalidad.value,
            "tipo_acceso": tipo_acceso,
            "resultado": resultado,
            "observacion": observacion,
        }
        acceso_resp = supabase.table("acceso").insert(acceso_data).execute()
        if not acceso_resp.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo registrar el acceso en la base de datos."
            )
        return acceso_resp.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al registrar el acceso: {str(e)}"
        )


@app.get(
    "/acceso/stats/hoy",
    response_model=StatsHoyResponse,
    summary="Estadísticas de accesos del vigilante para el día de hoy",
)
def stats_hoy(current_user=Depends(get_current_user)):
    rol = current_user.user_metadata.get("rol")
    if rol != "vigilante":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo para vigilantes.")

    hoy = datetime.now(timezone.utc).date().isoformat()
    inicio = f"{hoy}T00:00:00+00:00"
    fin    = f"{hoy}T23:59:59+00:00"

    resp_perm = (
        supabase.table("acceso")
        .select("id", count="exact")
        .eq("id_vigilante", current_user.id)
        .eq("resultado", "permitido")
        .gte("created_at", inicio)
        .lte("created_at", fin)
        .execute()
    )
    resp_den = (
        supabase.table("acceso")
        .select("id", count="exact")
        .eq("id_vigilante", current_user.id)
        .eq("resultado", "denegado")
        .gte("created_at", inicio)
        .lte("created_at", fin)
        .execute()
    )
    resp_alert = (
        supabase.table("alerta")
        .select("id", count="exact")
        .eq("estado", "Activa")
        .execute()
    )

    return StatsHoyResponse(
        autorizados=resp_perm.count or 0,
        denegados=resp_den.count or 0,
        alertas=resp_alert.count or 0,
    )


# --- Endpoints de Turnos (Vigilantes) -------------------------------------------------------------

@app.post(
    "/turnos/iniciar",
    status_code=status.HTTP_201_CREATED,
    summary="Iniciar un turno de vigilante",
)
def iniciar_turno(
    foto: UploadFile = File(...),
    observaciones: str = Form(None),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials
    try:
        response = supabase.auth.get_user(token)
        current_user = response.user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado"
        )

    # 1. Verificar rol de vigilante
    rol = current_user.user_metadata.get("rol")
    if rol != "vigilante":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los vigilantes pueden iniciar un turno."
        )

    # Crear cliente scoped para RLS en Storage y tablas
    user_supabase = create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
        options=ClientOptions(headers={"Authorization": f"Bearer {token}"})
    )

    # 2. Verificar si ya existe un turno activo para este vigilante
    try:
        activos_resp = user_supabase.table("turnos").select("*").eq("id_vigilante", current_user.id).eq("estado", "activo").execute()
        if activos_resp.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya tienes un turno activo en el sistema."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al verificar turnos existentes: {str(e)}"
        )

    # 3. Subir foto al bucket "Photos" de Supabase
    import uuid
    import os
    ext = os.path.splitext(foto.filename)[1] if foto.filename else ".jpg"
    if not ext:
        ext = ".jpg"
    filename = f"{current_user.id}/{uuid.uuid4()}{ext}"

    try:
        content = foto.file.read()
        user_supabase.storage.from_("Photos").upload(
            path=filename,
            file=content,
            file_options={"content-type": foto.content_type or "image/jpeg"}
        )
        foto_url = user_supabase.storage.from_("Photos").get_public_url(filename)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al subir la foto de inicio de turno: {str(e)}"
        )

    # 4. Registrar en base de datos
    try:
        turno_data = {
            "id_vigilante": current_user.id,
            "foto_inicio": foto_url,
            "estado": "activo",
            "observaciones": observaciones
        }
        insert_resp = user_supabase.table("turnos").insert(turno_data).execute()
        if not insert_resp.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo registrar el turno en la base de datos"
            )
        return insert_resp.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al registrar inicio de turno: {str(e)}"
        )


@app.post(
    "/turnos/finalizar",
    summary="Finalizar el turno activo de un vigilante",
)
def finalizar_turno(
    foto: UploadFile = File(...),
    observaciones: str = Form(None),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials
    try:
        response = supabase.auth.get_user(token)
        current_user = response.user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado"
        )

    # 1. Verificar rol de vigilante
    rol = current_user.user_metadata.get("rol")
    if rol != "vigilante":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los vigilantes pueden finalizar un turno."
        )

    # Crear cliente scoped para RLS en Storage y tablas
    user_supabase = create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
        options=ClientOptions(headers={"Authorization": f"Bearer {token}"})
    )

    # 2. Obtener el turno activo del vigilante
    try:
        activos_resp = user_supabase.table("turnos").select("*").eq("id_vigilante", current_user.id).eq("estado", "activo").execute()
        if not activos_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No tienes ningún turno activo para finalizar."
            )
        turno_activo = activos_resp.data[0]
        turno_id = turno_activo["id"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al buscar el turno activo: {str(e)}"
        )

    # 3. Subir foto de salida al bucket "Photos" de Supabase
    import uuid
    import os
    ext = os.path.splitext(foto.filename)[1] if foto.filename else ".jpg"
    if not ext:
        ext = ".jpg"
    filename = f"{current_user.id}/{uuid.uuid4()}_fin{ext}"

    try:
        content = foto.file.read()
        user_supabase.storage.from_("Photos").upload(
            path=filename,
            file=content,
            file_options={"content-type": foto.content_type or "image/jpeg"}
        )
        foto_fin_url = user_supabase.storage.from_("Photos").get_public_url(filename)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al subir la foto de fin de turno: {str(e)}"
        )

    # 4. Actualizar registro en base de datos
    try:
        obs_actuales = turno_activo.get("observaciones")
        obs_combinadas = observaciones
        if obs_actuales and observaciones:
            obs_combinadas = f"{obs_actuales} | Fin: {observaciones}"
        elif obs_actuales:
            obs_combinadas = obs_actuales

        update_data = {
            "fecha_fin": datetime.now(timezone.utc).isoformat(),
            "foto_fin": foto_fin_url,
            "estado": "finalizado",
            "observaciones": obs_combinadas
        }
        update_resp = user_supabase.table("turnos").update(update_data).eq("id", turno_id).execute()
        if not update_resp.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo actualizar el turno en la base de datos"
            )
        return update_resp.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al registrar final de turno: {str(e)}"
        )


@app.get(
    "/turnos/activo",
    summary="Obtener el turno activo del vigilante autenticado",
)
def obtener_turno_activo(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        response = supabase.auth.get_user(token)
        current_user = response.user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado"
        )

    rol = current_user.user_metadata.get("rol")
    if rol != "vigilante":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los vigilantes manejan turnos."
        )

    # Crear cliente scoped para RLS
    user_supabase = create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
        options=ClientOptions(headers={"Authorization": f"Bearer {token}"})
    )

    try:
        res = user_supabase.table("turnos").select("*").eq("id_vigilante", current_user.id).eq("estado", "activo").execute()
        if res.data:
            return res.data[0]
        return None
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al obtener el estado del turno: {str(e)}"
        )


# ── Biometría ────────────────────────────────────────────────────────────────

@app.get(
    "/personal/{id_personal}/biometria",
    response_model=BiometriaStatusResponse,
    summary="Consultar si el personal tiene biometría registrada",
)
def estado_biometria(id_personal: UUID, current_user=Depends(get_current_user)):
    resp = (
        supabase.table("biometria_personal")
        .select("id_personal,foto_referencia")
        .eq("id_personal", str(id_personal))
        .execute()
    )
    if resp.data:
        return BiometriaStatusResponse(
            tiene_biometria=True,
            id_personal=id_personal,
            foto_referencia=resp.data[0]["foto_referencia"],
        )
    return BiometriaStatusResponse(tiene_biometria=False, id_personal=id_personal)


@app.post(
    "/personal/{id_personal}/biometria/enroll",
    response_model=EnrollBiometriaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar biometría facial de un miembro del personal",
)
def enroll_biometria(
    id_personal: UUID,
    foto: UploadFile = File(...),
    current_user=Depends(require_enroll),
):
    # 1. Verificar que el personal existe
    p_resp = supabase.table("personal").select("id").eq("id", str(id_personal)).execute()
    if not p_resp.data:
        raise HTTPException(status_code=404, detail="Personal no encontrado.")

    # 2. Extraer embedding
    imagen_bytes = foto.file.read()
    embedding = _extraer_embedding(imagen_bytes)

    # 3. Subir foto de referencia al bucket Photos
    import uuid as uuid_lib, os
    ext = (os.path.splitext(foto.filename)[1] if foto.filename else "") or ".jpg"
    filename = f"biometria/{id_personal}/{uuid_lib.uuid4()}{ext}"
    supabase_admin.storage.from_("Photos").upload(
        path=filename,
        file=imagen_bytes,
        file_options={"content-type": foto.content_type or "image/jpeg"},
    )
    foto_url = supabase_admin.storage.from_("Photos").get_public_url(filename)

    # 4. Upsert — si ya tenía biometría, la reemplaza
    row_resp = (
        supabase.table("biometria_personal")
        .upsert(
            {
                "id_personal": str(id_personal),
                "foto_referencia": foto_url,
                "face_embedding": embedding,
            },
            on_conflict="id_personal",
        )
        .execute()
    )
    if not row_resp.data:
        raise HTTPException(status_code=500, detail="No se pudo guardar la biometría.")

    row = row_resp.data[0]
    return EnrollBiometriaResponse(
        id=row["id"],
        id_personal=UUID(row["id_personal"]),
        foto_referencia=row["foto_referencia"],
        created_at=row["created_at"],
    )


@app.post(
    "/acceso/biometrico/verificar",
    response_model=VerificarBiometriaResponse,
    summary="Identificar a una persona por biometría facial",
)
def verificar_biometrico(
    foto: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    # 1. Extraer embedding de la foto recibida
    imagen_bytes = foto.file.read()
    embedding_query = _extraer_embedding(imagen_bytes)

    # 2. Cargar todos los embeddings registrados
    db_resp = (
        supabase.table("biometria_personal")
        .select("id_personal,face_embedding")
        .execute()
    )
    if not db_resp.data:
        raise HTTPException(status_code=404, detail="No hay biometrías registradas en el sistema.")

    # 3. Encontrar la coincidencia más cercana
    mejor_distancia = float("inf")
    mejor_id = None
    for row in db_resp.data:
        d = _distancia_coseno(embedding_query, row["face_embedding"])
        if d < mejor_distancia:
            mejor_distancia = d
            mejor_id = row["id_personal"]

    if mejor_distancia > UMBRAL_BIOMETRICO:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró coincidencia biométrica (distancia={mejor_distancia:.3f}).",
        )

    # 4. Devolver datos del personal identificado
    p_resp = supabase.table("personal").select("*").eq("id", mejor_id).execute()
    if not p_resp.data:
        raise HTTPException(status_code=500, detail="Error al recuperar datos del personal.")

    p = p_resp.data[0]
    return VerificarBiometriaResponse(
        id_personal=UUID(p["id"]),
        codigo_institucional=p["codigo_institucional"],
        nombre=p["nombre"],
        tipo=p["tipo"],
        distancia=round(mejor_distancia, 4),
    )




