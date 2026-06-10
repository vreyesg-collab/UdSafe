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


@app.get(
    "/jefe/accesos/registro",
    summary="Registro detallado y paginado de todos los eventos de acceso",
)
def registro_accesos(
    periodo: str = "Hoy",
    estado: str = "todos",
    current_user=Depends(require_jefe),
):
    now = datetime.now(timezone.utc)
    if periodo == "Hoy":
        inicio = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc).isoformat()
        fin = datetime.combine(now.date(), datetime.max.time(), tzinfo=timezone.utc).isoformat()
    elif periodo == "Semana":
        from datetime import timedelta
        inicio = (now - timedelta(days=7)).isoformat()
        fin = now.isoformat()
    elif periodo == "Mes":
        from datetime import timedelta
        inicio = (now - timedelta(days=30)).isoformat()
        fin = now.isoformat()
    else:
        raise HTTPException(status_code=400, detail="Periodo no válido.")

    query = (
        supabase.table("acceso")
        .select(
            "id, created_at, resultado, modalidad, observacion, tipo_acceso, "
            "id_personal, id_jefe_validador, "
            "personal(id, nombre, tipo, codigo_institucional, biometria_personal(foto_referencia))"
        )
        .gte("created_at", inicio)
        .lte("created_at", fin)
        .order("created_at", desc=True)
        .limit(200)
    )
    if estado == "autorizados":
        query = query.eq("resultado", "permitido")
    elif estado == "denegados":
        query = query.eq("resultado", "denegado")
    elif estado == "especial":
        query = query.eq("tipo_acceso", "Especial")

    accesses = query.execute().data or []

    result = []
    for acc in accesses:
        personal_info = acc.get("personal")
        res_db = acc.get("resultado")
        estado_fe = "Autorizado" if res_db == "permitido" else "Denegado" if res_db == "denegado" else "Especial"

        if personal_info:
            nombre_fe = personal_info.get("nombre") or "—"
            tipo_fe = (personal_info.get("tipo") or "").capitalize() or "—"
            codigo_fe = personal_info.get("codigo_institucional") or "—"
            bio = personal_info.get("biometria_personal")
            foto_fe = None
            if isinstance(bio, list) and bio:
                foto_fe = bio[0].get("foto_referencia")
            elif isinstance(bio, dict):
                foto_fe = bio.get("foto_referencia")
        else:
            obs = acc.get("observacion") or ""
            if obs.startswith("Visitante: "):
                nombre_fe = obs.split(" | ")[0].replace("Visitante: ", "").strip()
            else:
                nombre_fe = "Sin identificar"
            tipo_fe = "Visitante"
            codigo_fe = "—"
            foto_fe = None

        hora_fe = "--:--"
        c_at = acc.get("created_at")
        if c_at:
            try:
                dt = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                hora_fe = dt.strftime("%H:%M")
            except Exception:
                pass

        result.append({
            "id": acc.get("id"),
            "nombre": nombre_fe,
            "tipo": tipo_fe,
            "codigo_institucional": codigo_fe,
            "modalidad": acc.get("modalidad") or "—",
            "tipo_acceso": acc.get("tipo_acceso") or "Normal",
            "porteria": "Principal",
            "hora": hora_fe,
            "created_at": c_at,
            "estado": estado_fe,
            "observacion": acc.get("observacion"),
            "foto_referencia": foto_fe,
            "foto_visitante": None,
            "id_jefe_validador": str(acc["id_jefe_validador"]) if acc.get("id_jefe_validador") else None,
        })

    # Enrich visitor entries with their captured photo from solicitudes_especiales
    visitor_indices = [i for i, r in enumerate(result) if r["tipo"] == "Visitante"]
    if visitor_indices:
        nombres = list({result[i]["nombre"] for i in visitor_indices if result[i]["nombre"] not in ("—", "Sin identificar")})
        if nombres:
            try:
                fotos_resp = (
                    supabase.table("solicitudes_especiales")
                    .select("nombre_visitante, foto_visitante")
                    .in_("nombre_visitante", nombres)
                    .eq("estado", "aprobada")
                    .order("created_at", desc=True)
                    .execute()
                )
                foto_map: dict[str, str] = {}
                for row in (fotos_resp.data or []):
                    nombre = row.get("nombre_visitante")
                    foto = row.get("foto_visitante")
                    if nombre and foto and nombre not in foto_map:
                        foto_map[nombre] = foto
                for i in visitor_indices:
                    result[i]["foto_visitante"] = foto_map.get(result[i]["nombre"])
            except Exception:
                pass

    return result


@app.get(
    "/jefe/dashboard/stats",
    summary="Estadísticas de accesos para el jefe de seguridad",
)
def jefe_dashboard_stats(period: str = "Hoy", current_user=Depends(require_jefe)):
    now = datetime.now(timezone.utc)
    
    # 1. Determinar rangos de fecha
    if period == "Hoy":
        inicio = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc).isoformat()
        fin = datetime.combine(now.date(), datetime.max.time(), tzinfo=timezone.utc).isoformat()
    elif period == "Semana":
        from datetime import timedelta
        inicio = (now - timedelta(days=7)).isoformat()
        fin = now.isoformat()
    elif period == "Mes":
        from datetime import timedelta
        inicio = (now - timedelta(days=30)).isoformat()
        fin = now.isoformat()
    else:
        raise HTTPException(status_code=400, detail="Periodo no válido. Use Hoy, Semana o Mes.")

    # 2. Consultar accesos del periodo
    try:
        acceso_resp = (
            supabase.table("acceso")
            .select("id, created_at, resultado, modalidad, observacion, personal(nombre, tipo)")
            .gte("created_at", inicio)
            .lte("created_at", fin)
            .order("created_at", desc=True)
            .execute()
        )
        accesses = acceso_resp.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener accesos: {str(e)}")

    # 3. Anomalías activas (alertas activas)
    try:
        alerta_resp = (
            supabase.table("alerta")
            .select("id", count="exact")
            .eq("estado", "Activa")
            .execute()
        )
        anomalies_count = alerta_resp.count or 0
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener alertas: {str(e)}")

    # 4. Procesar estadísticas generales
    total_accesos = len(accesses)
    autorizados = sum(1 for a in accesses if a.get("resultado") == "permitido")
    denegados = sum(1 for a in accesses if a.get("resultado") == "denegado")

    # 5. Distribución por tipo de usuario
    user_counts = {
        "Estudiantes": 0,
        "Docentes": 0,
        "Administrativos": 0,
        "Visitantes": 0
    }
    
    for acc in accesses:
        personal_info = acc.get("personal")
        if personal_info:
            p_tipo = personal_info.get("tipo")
            if p_tipo == "estudiante":
                user_counts["Estudiantes"] += 1
            elif p_tipo == "docente":
                user_counts["Docentes"] += 1
            elif p_tipo == "administrativo":
                user_counts["Administrativos"] += 1
            else:
                user_counts["Visitantes"] += 1
        else:
            user_counts["Visitantes"] += 1

    user_types_list = []
    colors = {
        "Estudiantes": "#1d4ed8",
        "Docentes": "#16a34a",
        "Administrativos": "#ca8a04",
        "Visitantes": "#dc2626"
    }
    for label, count in user_counts.items():
        pct = round((count / total_accesos * 100)) if total_accesos > 0 else 0
        user_types_list.append({
            "label": label,
            "count": count,
            "pct": pct,
            "color": colors[label]
        })

    # 6. Flujo de accesos por hora (siempre de HOY)
    inicio_hoy = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc).isoformat()
    fin_hoy = datetime.combine(now.date(), datetime.max.time(), tzinfo=timezone.utc).isoformat()
    
    try:
        acceso_hoy_resp = (
            supabase.table("acceso")
            .select("created_at")
            .gte("created_at", inicio_hoy)
            .lte("created_at", fin_hoy)
            .execute()
        )
        hoy_accesses = acceso_hoy_resp.data or []
    except Exception as e:
        hoy_accesses = []

    target_hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    hourly_counts = {h: 0 for h in target_hours}
    
    for acc in hoy_accesses:
        c_at = acc.get("created_at")
        if c_at:
            try:
                dt = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                h = dt.hour
                if h in hourly_counts:
                    hourly_counts[h] += 1
            except:
                pass
                
    hourly_flow_list = [{"hour": f"{h}h", "value": count} for h, count in hourly_counts.items()]

    # 7. Últimos eventos registrados (los 10 más recientes)
    ultimos_eventos = []
    for acc in accesses[:10]:
        personal_info = acc.get("personal")
        
        res_db = acc.get("resultado")
        if res_db == "permitido":
            estado_fe = "Autorizado"
        elif res_db == "denegado":
            estado_fe = "Denegado"
        else:
            estado_fe = "Especial"
            
        if personal_info:
            tipo_fe = (personal_info.get("tipo") or "").capitalize() or "—"
            persona_fe = personal_info.get("nombre") or "—"
        else:
            # Acceso especial: el nombre está en observacion → "Visitante: {nombre} | {motivo}"
            observacion = acc.get("observacion") or ""
            if observacion.startswith("Visitante: "):
                persona_fe = observacion.split(" | ")[0].replace("Visitante: ", "").strip()
            else:
                persona_fe = "Sin identificar"
            tipo_fe = "Visitante"

        hora_fe = "--:--"
        c_at = acc.get("created_at")
        if c_at:
            try:
                dt = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                hora_fe = dt.strftime("%H:%M")
            except:
                pass

        ultimos_eventos.append({
            "persona": persona_fe,
            "tipo": tipo_fe,
            "metodo": acc.get("modalidad") or "—",
            "porteria": "Principal",
            "hora": hora_fe,
            "estado": estado_fe
        })

    return {
        "total_accesos": total_accesos,
        "autorizados": autorizados,
        "denegados": denegados,
        "anomalias_activas": anomalies_count,
        "user_types": user_types_list,
        "hourly_flow": hourly_flow_list,
        "events": ultimos_eventos
    }


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


# ── Acceso Especial (Visitantes) ─────────────────────────────────────────────

@app.post("/acceso/especial", status_code=status.HTTP_201_CREATED,
          summary="Vigilante crea una solicitud de acceso especial para un visitante")
def crear_solicitud_especial(
    nombre_visitante: str = Form(...),
    cedula_visitante: str = Form(...),
    motivo: str = Form(...),
    porteria: str = Form("Principal"),
    foto: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    import uuid as uuid_lib, os as _os
    rol = current_user.user_metadata.get("rol")
    if rol != "vigilante":
        raise HTTPException(status_code=403, detail="Solo vigilantes pueden crear solicitudes de acceso especial.")

    ext = (_os.path.splitext(foto.filename)[1] if foto.filename else "") or ".jpg"
    filename = f"especiales/{current_user.id}/{uuid_lib.uuid4()}{ext}"
    try:
        content = foto.file.read()
        supabase_admin.storage.from_("Photos").upload(
            path=filename,
            file=content,
            file_options={"content-type": foto.content_type or "image/jpeg"},
        )
        foto_url = supabase_admin.storage.from_("Photos").get_public_url(filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir la foto del visitante: {str(e)}")

    nombre_vigilante = current_user.user_metadata.get("nombre", "")
    solicitud = {
        "nombre_visitante": nombre_visitante,
        "cedula_visitante": cedula_visitante,
        "motivo": motivo,
        "porteria": porteria,
        "estado": "pendiente",
        "id_vigilante": current_user.id,
        "nombre_vigilante": nombre_vigilante,
        "foto_visitante": foto_url,
    }
    resp = supabase.table("solicitudes_especiales").insert(solicitud).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="No se pudo crear la solicitud.")
    return resp.data[0]


@app.get("/acceso/especial/{solicitud_id}",
         summary="Vigilante consulta el estado de su solicitud (polling)")
def get_solicitud_especial(solicitud_id: str, current_user=Depends(get_current_user)):
    resp = supabase.table("solicitudes_especiales").select("*").eq("id", solicitud_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    return resp.data[0]


@app.post("/acceso/especial/{solicitud_id}/cancelar", status_code=status.HTTP_204_NO_CONTENT,
          summary="Vigilante cancela su solicitud pendiente")
def cancelar_solicitud_especial(solicitud_id: str, current_user=Depends(get_current_user)):
    resp = (
        supabase.table("solicitudes_especiales")
        .update({"estado": "cancelada"})
        .eq("id", solicitud_id)
        .eq("id_vigilante", current_user.id)
        .eq("estado", "pendiente")
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o ya resuelta.")


@app.get("/jefe/accesos/especiales",
         summary="Jefe lista solicitudes de acceso especial")
def listar_solicitudes_especiales(estado: str = "pendiente", current_user=Depends(require_jefe)):
    resp = (
        supabase.table("solicitudes_especiales")
        .select("*")
        .eq("estado", estado)
        .order("created_at", desc=True)
        .execute()
    )
    return resp.data or []


@app.get("/jefe/accesos/especiales/{solicitud_id}",
         summary="Jefe obtiene detalle de una solicitud + historial del visitante")
def get_solicitud_especial_jefe(solicitud_id: str, current_user=Depends(require_jefe)):
    resp = supabase.table("solicitudes_especiales").select("*").eq("id", solicitud_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    solicitud = resp.data[0]

    historial_resp = (
        supabase.table("solicitudes_especiales")
        .select("id, created_at, estado, vigencia")
        .eq("cedula_visitante", solicitud["cedula_visitante"])
        .neq("estado", "cancelada")
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )
    solicitud["historial"] = historial_resp.data or []
    return solicitud


@app.post("/jefe/accesos/especiales/{solicitud_id}/decision",
          summary="Jefe aprueba o deniega una solicitud de acceso especial")
def decidir_solicitud_especial(
    solicitud_id: str, data: DecisionSolicitudRequest, current_user=Depends(require_jefe)
):
    if data.decision not in ("aprobada", "denegada"):
        raise HTTPException(status_code=400, detail="La decisión debe ser 'aprobada' o 'denegada'.")

    nombre_jefe = current_user.user_metadata.get("nombre", "")
    update_data = {
        "estado": data.decision,
        "id_jefe": current_user.id,
        "nombre_jefe": nombre_jefe,
        "fecha_decision": datetime.now(timezone.utc).isoformat(),
        "observacion_jefe": data.observacion,
    }
    if data.vigencia:
        update_data["vigencia"] = data.vigencia

    resp = (
        supabase.table("solicitudes_especiales")
        .update(update_data)
        .eq("id", solicitud_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")

    solicitud = resp.data[0]

    # Registrar el evento en la tabla acceso para el log del jefe
    try:
        acceso_data = {
            "id_personal": None,
            "id_vigilante": solicitud["id_vigilante"],
            "modalidad": "Manual",
            "tipo_acceso": "Especial",
            "resultado": "permitido" if data.decision == "aprobada" else "denegado",
            "observacion": f"Visitante: {solicitud['nombre_visitante']} | {solicitud['motivo']}",
            "id_jefe_validador": current_user.id,
            "fecha_validacion": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("acceso").insert(acceso_data).execute()
    except Exception:
        pass

    return solicitud


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




