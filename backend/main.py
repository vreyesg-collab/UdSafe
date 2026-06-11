from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form
import numpy as np
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

BOGOTA_TZ = ZoneInfo("America/Bogota")
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

# ── Reglas de Control de Acceso — helper ─────────────────────────────────────

_DIAS_SEMANA = {
    0: "lunes",
    1: "martes",
    2: "miércoles",
    3: "jueves",
    4: "viernes",
    5: "sábado",
    6: "domingo",
}


def _verificar_reglas_ca(tipo_personal: str):
    """
    Retorna (permitido: bool, motivo: str).
    Si no hay reglas activas configuradas, el acceso es libre.
    Un acceso es permitido cuando al menos una regla activa coincide con el día,
    la hora actual y el tipo del personal.
    """
    reglas_resp = supabase.table("reglas_acceso").select("*").eq("activa", True).execute()
    reglas = reglas_resp.data or []
    if not reglas:
        return True, ""

    now = datetime.now(BOGOTA_TZ)
    dia_actual = _DIAS_SEMANA[now.weekday()]
    hora_actual = now.time().replace(tzinfo=None)

    for regla in reglas:
        if dia_actual not in (regla.get("dias") or []):
            continue
        try:
            hi = datetime.strptime(regla["hora_inicio"][:8], "%H:%M:%S").time()
            hf = datetime.strptime(regla["hora_fin"][:8], "%H:%M:%S").time()
        except (ValueError, TypeError, KeyError):
            continue
        if hi <= hora_actual <= hf:
            if tipo_personal in (regla.get("tipos_permitidos") or []):
                return True, ""

    return False, "Acceso no permitido según las reglas de control de acceso vigentes."


@app.get(
    "/acceso/validar/{codigo_institucional}",
    response_model=ValidarAccesoResponse,
    summary="Validar la existencia de personal por su código institucional",
)
def validar_acceso(codigo_institucional: str, current_user=Depends(get_current_user)):
    response = supabase.table("personal").select("*").eq("codigo_institucional", codigo_institucional).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Código institucional no encontrado.")
    personal_data = response.data[0]

    if not personal_data.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail="Acceso deshabilitado para este miembro del personal."
        )

    ca_ok, ca_motivo = _verificar_reglas_ca(personal_data["tipo"])
    if not ca_ok:
        raise HTTPException(status_code=403, detail=ca_motivo)

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
        if not personal_data.get("is_active", True):
            resultado   = ResultadoAcceso.denegado.value
            observacion = "Acceso deshabilitado para este miembro del personal."
        else:
            ca_ok, ca_motivo = _verificar_reglas_ca(personal_data["tipo"])
            if not ca_ok:
                resultado   = ResultadoAcceso.denegado.value
                observacion = ca_motivo
            else:
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

    hoy = datetime.now(BOGOTA_TZ).date().isoformat()
    inicio = f"{hoy}T00:00:00-05:00"
    fin    = f"{hoy}T23:59:59-05:00"

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
    now = datetime.now(BOGOTA_TZ)
    if periodo == "Hoy":
        inicio = datetime.combine(now.date(), datetime.min.time(), tzinfo=BOGOTA_TZ).isoformat()
        fin = datetime.combine(now.date(), datetime.max.time(), tzinfo=BOGOTA_TZ).isoformat()
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
                hora_fe = dt.astimezone(BOGOTA_TZ).strftime("%H:%M")
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
    now = datetime.now(BOGOTA_TZ)

    # 1. Determinar rangos de fecha
    if period == "Hoy":
        inicio = datetime.combine(now.date(), datetime.min.time(), tzinfo=BOGOTA_TZ).isoformat()
        fin = datetime.combine(now.date(), datetime.max.time(), tzinfo=BOGOTA_TZ).isoformat()
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
    inicio_hoy = datetime.combine(now.date(), datetime.min.time(), tzinfo=BOGOTA_TZ).isoformat()
    fin_hoy = datetime.combine(now.date(), datetime.max.time(), tzinfo=BOGOTA_TZ).isoformat()
    
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
                dt = datetime.fromisoformat(c_at.replace("Z", "+00:00")).astimezone(BOGOTA_TZ)
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
                hora_fe = dt.astimezone(BOGOTA_TZ).strftime("%H:%M")
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
    current_user=Depends(require_jefe),
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


# ── Alertas / Anomalías ───────────────────────────────────────────────────────


@app.get(
    "/alertas/activas",
    summary="Devuelve las alertas activas (accesible a todos los roles autenticados)",
)
def get_alertas_activas(current_user=Depends(get_current_user)):
    resp = (
        supabase.table("alerta")
        .select("*, vigilante:id_emisor(nombre)")
        .eq("estado", "Activa")
        .order("fecha_hora", desc=True)
        .execute()
    )
    rows = resp.data or []
    result = []
    for r in rows:
        vigilante_data = r.pop("vigilante", None)
        nombre_emisor = vigilante_data.get("nombre") if isinstance(vigilante_data, dict) else None
        result.append({**r, "nombre_emisor": nombre_emisor})
    return result


@app.post(
    "/alertas",
    status_code=status.HTTP_201_CREATED,
    summary="Cualquier usuario autenticado emite una alerta de seguridad",
)
def crear_alerta(
    data: CrearAlertaRequest,
    current_user=Depends(get_current_user),
):
    now = datetime.now(BOGOTA_TZ).isoformat()
    resp = supabase.table("alerta").insert({
        "id_emisor": str(current_user.id),
        "asunto": data.asunto,
        "observaciones": data.descripcion,
        "estado": "Activa",
        "fecha_hora": now,
    }).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Error al crear la alerta.")
    row = resp.data[0]
    return {**row, "nombre_emisor": current_user.user_metadata.get("nombre", "")}


@app.get(
    "/jefe/alertas",
    summary="Jefe obtiene el historial de alertas con filtros",
)
def listar_alertas(
    estado: str = "todos",
    fecha: Optional[str] = None,
    periodo: Optional[str] = None,
    current_user=Depends(require_jefe),
):
    from datetime import timedelta
    now = datetime.now(BOGOTA_TZ)

    query = supabase.table("alerta").select("*, vigilante:id_emisor(nombre)").order("fecha_hora", desc=True)

    if estado != "todos":
        query = query.eq("estado", estado)

    if fecha:
        dia = datetime.fromisoformat(fecha)
        inicio = datetime.combine(dia.date(), datetime.min.time(), tzinfo=BOGOTA_TZ).isoformat()
        fin = datetime.combine(dia.date(), datetime.max.time(), tzinfo=BOGOTA_TZ).isoformat()
        query = query.gte("fecha_hora", inicio).lte("fecha_hora", fin)
    elif periodo == "Hoy":
        inicio = datetime.combine(now.date(), datetime.min.time(), tzinfo=BOGOTA_TZ).isoformat()
        fin = datetime.combine(now.date(), datetime.max.time(), tzinfo=BOGOTA_TZ).isoformat()
        query = query.gte("fecha_hora", inicio).lte("fecha_hora", fin)
    elif periodo == "Semana":
        inicio = (now - timedelta(days=7)).isoformat()
        query = query.gte("fecha_hora", inicio)
    elif periodo == "Mes":
        inicio = (now - timedelta(days=30)).isoformat()
        query = query.gte("fecha_hora", inicio)

    resp = query.execute()
    rows = resp.data or []
    result = []
    for r in rows:
        vigilante_data = r.pop("vigilante", None)
        nombre_emisor = None
        if isinstance(vigilante_data, dict):
            nombre_emisor = vigilante_data.get("nombre")
        result.append({**r, "nombre_emisor": nombre_emisor})
    return result


@app.patch(
    "/jefe/alertas/{alerta_id}/resolver",
    summary="Jefe marca una alerta como resuelta",
)
def resolver_alerta(
    alerta_id: str,
    current_user=Depends(require_jefe),
):
    resp = supabase.table("alerta").update({"estado": "Resuelta"}).eq("id", alerta_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Alerta no encontrada.")
    return resp.data[0]


# ── Vigilantes (gestión por el jefe) ─────────────────────────────────────────

@app.get("/jefe/vigilantes", summary="Jefe lista todos los vigilantes registrados")
def listar_vigilantes(current_user=Depends(require_jefe)):
    from datetime import timedelta
    try:
        auth_users = supabase.auth.admin.list_users()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener usuarios: {str(e)}")

    vigilantes_ids = [str(u.id) for u in auth_users if u.user_metadata.get("rol") == "vigilante"]
    if not vigilantes_ids:
        return []

    usuarios_resp = supabase.table("usuarios").select("*").in_("id", vigilantes_ids).execute()
    usuarios_map = {u["id"]: u for u in (usuarios_resp.data or [])}

    turnos_resp = supabase.table("turnos").select("id_vigilante").eq("estado", "activo").execute()
    ids_con_turno = {t["id_vigilante"] for t in (turnos_resp.data or [])}

    result = []
    for u in auth_users:
        uid = str(u.id)
        if uid not in vigilantes_ids:
            continue
        usuario = usuarios_map.get(uid, {})
        result.append({
            "id": uid,
            "nombre": usuario.get("nombre") or u.user_metadata.get("nombre", ""),
            "cedula": usuario.get("cedula", ""),
            "correo": usuario.get("correo") or u.email or "",
            "turno_activo": uid in ids_con_turno,
        })
    return result


@app.post("/jefe/vigilantes", status_code=201, summary="Jefe registra un nuevo vigilante")
def crear_vigilante_jefe(data: RegistroVigilanteRequest, current_user=Depends(require_jefe)):
    try:
        auth_resp = supabase.auth.admin.create_user({
            "email": data.correo,
            "password": data.password,
            "user_metadata": {"rol": "vigilante", "nombre": data.nombre},
            "email_confirm": True,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not auth_resp.user:
        raise HTTPException(status_code=400, detail="No se pudo crear el usuario")

    uid = str(auth_resp.user.id)
    supabase.table("usuarios").insert({
        "id": uid,
        "cedula": data.cedula,
        "correo": data.correo,
        "nombre": data.nombre,
    }).execute()

    return {"id": uid, "nombre": data.nombre, "cedula": data.cedula, "correo": data.correo, "turno_activo": False}


@app.get("/jefe/turnos", summary="Jefe lista todos los turnos con filtros opcionales")
def listar_turnos_jefe(
    periodo: str = "Hoy",
    estado: str = "todos",
    id_vigilante: Optional[str] = None,
    current_user=Depends(require_jefe),
):
    from datetime import timedelta
    now = datetime.now(BOGOTA_TZ)

    query = supabase.table("turnos").select("*").order("created_at", desc=True)

    if estado != "todos":
        query = query.eq("estado", estado)

    if id_vigilante:
        query = query.eq("id_vigilante", id_vigilante)

    if periodo == "Hoy":
        inicio = datetime.combine(now.date(), datetime.min.time(), tzinfo=BOGOTA_TZ).isoformat()
        fin = datetime.combine(now.date(), datetime.max.time(), tzinfo=BOGOTA_TZ).isoformat()
        query = query.gte("created_at", inicio).lte("created_at", fin)
    elif periodo == "Semana":
        query = query.gte("created_at", (now - timedelta(days=7)).isoformat())
    elif periodo == "Mes":
        query = query.gte("created_at", (now - timedelta(days=30)).isoformat())
    # periodo == "Todos": sin filtro de fecha

    resp = query.execute()
    rows = resp.data or []

    # Resolver nombres desde la tabla usuarios en un segundo paso
    ids_vigilantes = list({r["id_vigilante"] for r in rows if r.get("id_vigilante")})
    nombres_map: dict = {}
    if ids_vigilantes:
        try:
            usu_resp = supabase.table("usuarios").select("id, nombre").in_("id", ids_vigilantes).execute()
            nombres_map = {u["id"]: u["nombre"] for u in (usu_resp.data or [])}
        except Exception:
            pass

    return [{**r, "nombre_vigilante": nombres_map.get(r.get("id_vigilante", ""), None)} for r in rows]


# ── Personal (gestión por el jefe) ────────────────────────────────────────────

@app.get("/jefe/personal", summary="Jefe lista todos los miembros del personal con foto biométrica")
def listar_personal_jefe(
    tipo: Optional[str] = None,
    busqueda: Optional[str] = None,
    current_user=Depends(require_jefe),
):
    query = supabase.table("personal").select("*").order("nombre")
    if tipo and tipo != "todos":
        query = query.eq("tipo", tipo)
    if busqueda:
        query = query.ilike("nombre", f"%{busqueda}%")

    resp = query.execute()
    personal = resp.data or []

    if personal:
        ids = [p["id"] for p in personal]
        bio_resp = (
            supabase.table("biometria_personal")
            .select("id_personal, foto_referencia")
            .in_("id_personal", ids)
            .execute()
        )
        bio_map = {b["id_personal"]: b["foto_referencia"] for b in (bio_resp.data or [])}
        personal = [{**p, "foto_referencia": bio_map.get(p["id"])} for p in personal]

    return personal


@app.get("/jefe/personal/{id_personal}/detalle", summary="Historial y estadísticas de accesos de un miembro")
def detalle_personal_jefe(
    id_personal: str,
    periodo: str = "Mes",
    current_user=Depends(require_jefe),
):
    from datetime import timedelta
    now = datetime.now(BOGOTA_TZ)

    personal_resp = supabase.table("personal").select("*").eq("id", id_personal).execute()
    if not personal_resp.data:
        raise HTTPException(status_code=404, detail="Personal no encontrado.")
    personal = personal_resp.data[0]

    bio_resp = (
        supabase.table("biometria_personal")
        .select("foto_referencia")
        .eq("id_personal", id_personal)
        .execute()
    )
    foto = bio_resp.data[0]["foto_referencia"] if bio_resp.data else None

    query = (
        supabase.table("acceso")
        .select("*")
        .eq("id_personal", id_personal)
        .order("created_at", desc=True)
    )
    if periodo == "Hoy":
        inicio = datetime.combine(now.date(), datetime.min.time(), tzinfo=BOGOTA_TZ).isoformat()
        fin = datetime.combine(now.date(), datetime.max.time(), tzinfo=BOGOTA_TZ).isoformat()
        query = query.gte("created_at", inicio).lte("created_at", fin)
    elif periodo == "Semana":
        query = query.gte("created_at", (now - timedelta(days=7)).isoformat())
    elif periodo == "Mes":
        query = query.gte("created_at", (now - timedelta(days=30)).isoformat())
    # "Todos": sin filtro de fecha

    accesos_resp = query.execute()
    accesos = accesos_resp.data or []

    total = len(accesos)
    permitidos = sum(1 for a in accesos if a.get("resultado") == "permitido")
    denegados = sum(1 for a in accesos if a.get("resultado") == "denegado")

    return {
        "personal": {**personal, "foto_referencia": foto},
        "stats": {"total": total, "permitidos": permitidos, "denegados": denegados},
        "accesos": accesos,
    }


@app.post("/jefe/personal/importar", status_code=200, summary="Jefe importa registros de personal desde CSV o XLSX")
def importar_personal(
    archivo: UploadFile = File(...),
    current_user=Depends(require_jefe),
):
    import csv, io
    import openpyxl

    TIPOS_VALIDOS = {"visitante", "estudiante", "servicios_generales", "administrativo", "docente"}
    COLUMNAS_REQ = {"nombre", "tipo", "codigo_institucional"}

    # ── Leer filas según extensión ──────────────────────────────────────────
    nombre_archivo = (archivo.filename or "").lower()
    contenido = archivo.file.read()

    filas: list[dict] = []

    if nombre_archivo.endswith(".csv"):
        texto = contenido.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(texto))
        for row in reader:
            filas.append({k.strip().lower(): (v or "").strip() for k, v in row.items()})

    elif nombre_archivo.endswith((".xlsx", ".xls")):
        wb = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            raise HTTPException(status_code=400, detail="El archivo Excel está vacío.")
        encabezados = [str(c).strip().lower() if c is not None else "" for c in rows[0]]
        for fila in rows[1:]:
            filas.append({encabezados[i]: str(v).strip() if v is not None else "" for i, v in enumerate(fila)})
        wb.close()

    else:
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa CSV o XLSX.")

    if not filas:
        raise HTTPException(status_code=400, detail="El archivo no contiene datos.")

    # Verificar columnas requeridas
    cols = set(filas[0].keys())
    faltantes = COLUMNAS_REQ - cols
    if faltantes:
        raise HTTPException(
            status_code=422,
            detail=f"Columnas requeridas no encontradas: {', '.join(sorted(faltantes))}. "
                   f"Columnas detectadas: {', '.join(sorted(cols))}.",
        )

    # ── Procesar filas ──────────────────────────────────────────────────────
    insertados = 0
    omitidos = 0
    errores: list[dict] = []

    for idx, fila in enumerate(filas, start=2):
        nombre = fila.get("nombre", "").strip()
        tipo = fila.get("tipo", "").strip().lower()
        codigo = fila.get("codigo_institucional", "").strip()
        is_active_raw = fila.get("is_active", "true").strip().lower()

        # Validaciones
        if not nombre or not tipo or not codigo:
            errores.append({"fila": idx, "motivo": "Campos obligatorios vacíos (nombre, tipo, codigo_institucional)"})
            omitidos += 1
            continue

        if tipo not in TIPOS_VALIDOS:
            errores.append({"fila": idx, "motivo": f"Tipo «{tipo}» inválido. Válidos: {', '.join(sorted(TIPOS_VALIDOS))}"})
            omitidos += 1
            continue

        is_active = is_active_raw not in ("false", "0", "no", "inactivo", "deshabilitado")

        try:
            supabase.table("personal").insert({
                "nombre": nombre,
                "tipo": tipo,
                "codigo_institucional": codigo,
                "is_active": is_active,
            }).execute()
            insertados += 1
        except Exception as e:
            msg = str(e)
            if "duplicate" in msg.lower() or "unique" in msg.lower():
                motivo = f"Código institucional «{codigo}» ya existe"
            else:
                motivo = msg[:120]
            errores.append({"fila": idx, "motivo": motivo})
            omitidos += 1

    return {
        "total": len(filas),
        "insertados": insertados,
        "omitidos": omitidos,
        "errores": errores[:50],  # limitar a 50 errores en la respuesta
    }


@app.patch("/jefe/personal/{id_personal}/toggle-activo", summary="Jefe activa o desactiva el acceso de un miembro")
def toggle_activo_personal(id_personal: str, current_user=Depends(require_jefe)):
    personal_resp = supabase.table("personal").select("id, is_active").eq("id", id_personal).execute()
    if not personal_resp.data:
        raise HTTPException(status_code=404, detail="Personal no encontrado.")

    actual = personal_resp.data[0].get("is_active", True)
    update_resp = supabase.table("personal").update({"is_active": not actual}).eq("id", id_personal).execute()
    if not update_resp.data:
        raise HTTPException(status_code=500, detail="No se pudo actualizar el estado.")
    return update_resp.data[0]


# ── Reglas de Control de Acceso — CRUD ────────────────────────────────────────

class ReglaAccesoCreate(BaseModel):
    nombre: Optional[str] = None
    dias: list[str]
    hora_inicio: str
    hora_fin: str
    tipos_permitidos: list[str]
    activa: bool = True


@app.get("/jefe/reglas-acceso", summary="Jefe lista las reglas de control de acceso")
def listar_reglas_ca(current_user=Depends(require_jefe)):
    resp = supabase.table("reglas_acceso").select("*").order("created_at", desc=False).execute()
    return resp.data or []


@app.post("/jefe/reglas-acceso", status_code=201, summary="Jefe crea una nueva regla de control de acceso")
def crear_regla_ca(data: ReglaAccesoCreate, current_user=Depends(require_jefe)):
    if not data.dias:
        raise HTTPException(status_code=422, detail="Debes seleccionar al menos un día.")
    if not data.tipos_permitidos:
        raise HTTPException(status_code=422, detail="Debes seleccionar al menos un tipo de personal.")
    row = {
        "nombre": data.nombre or None,
        "dias": data.dias,
        "hora_inicio": data.hora_inicio,
        "hora_fin": data.hora_fin,
        "tipos_permitidos": data.tipos_permitidos,
        "activa": data.activa,
    }
    resp = supabase.table("reglas_acceso").insert(row).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="No se pudo crear la regla.")
    return resp.data[0]


@app.put("/jefe/reglas-acceso/{id_regla}", summary="Jefe actualiza una regla de control de acceso")
def actualizar_regla_ca(id_regla: str, data: ReglaAccesoCreate, current_user=Depends(require_jefe)):
    update = data.model_dump(exclude_none=False)
    resp = supabase.table("reglas_acceso").update(update).eq("id", id_regla).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Regla no encontrada.")
    return resp.data[0]


@app.patch("/jefe/reglas-acceso/{id_regla}/toggle", summary="Jefe activa o desactiva una regla")
def toggle_regla_ca(id_regla: str, current_user=Depends(require_jefe)):
    regla_resp = supabase.table("reglas_acceso").select("id, activa").eq("id", id_regla).execute()
    if not regla_resp.data:
        raise HTTPException(status_code=404, detail="Regla no encontrada.")
    actual = regla_resp.data[0].get("activa", True)
    resp = supabase.table("reglas_acceso").update({"activa": not actual}).eq("id", id_regla).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="No se pudo actualizar la regla.")
    return resp.data[0]


@app.delete("/jefe/reglas-acceso/{id_regla}", status_code=204, summary="Jefe elimina una regla de control de acceso")
def eliminar_regla_ca(id_regla: str, current_user=Depends(require_jefe)):
    resp = supabase.table("reglas_acceso").delete().eq("id", id_regla).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Regla no encontrada.")
