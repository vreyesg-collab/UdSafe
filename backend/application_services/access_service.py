from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
import numpy as np
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional
from uuid import UUID

from database import supabase, supabase_admin
from models import *
from auth import get_current_user, require_jefe

router = APIRouter()

BOGOTA_TZ = ZoneInfo("America/Bogota")

_DIAS_SEMANA = {
    0: "lunes",
    1: "martes",
    2: "miércoles",
    3: "jueves",
    4: "viernes",
    5: "sábado",
    6: "domingo",
}

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


@router.get(
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


@router.post(
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


@router.get(
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


@router.post(
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


@router.post("/acceso/especial", status_code=status.HTTP_201_CREATED,
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


@router.get("/acceso/especial/{solicitud_id}",
            summary="Vigilante consulta el estado de su solicitud (polling)")
def get_solicitud_especial(solicitud_id: str, current_user=Depends(get_current_user)):
    resp = supabase.table("solicitudes_especiales").select("*").eq("id", solicitud_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    return resp.data[0]


@router.post("/acceso/especial/{solicitud_id}/cancelar", status_code=status.HTTP_204_NO_CONTENT,
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


@router.get("/jefe/accesos/especiales",
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


@router.get("/jefe/accesos/especiales/{solicitud_id}",
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


@router.post("/jefe/accesos/especiales/{solicitud_id}/decision",
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


@router.post(
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


@router.get("/jefe/personal", summary="Jefe lista todos los miembros del personal con foto biométrica")
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


@router.get("/jefe/personal/{id_personal}/detalle", summary="Historial y estadísticas de accesos de un miembro")
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


@router.patch("/jefe/personal/{id_personal}/toggle-activo", summary="Jefe activa o desactiva el acceso de un miembro")
def toggle_activo_personal(id_personal: str, current_user=Depends(require_jefe)):
    personal_resp = supabase.table("personal").select("id, is_active").eq("id", id_personal).execute()
    if not personal_resp.data:
        raise HTTPException(status_code=404, detail="Personal no encontrado.")

    actual = personal_resp.data[0].get("is_active", True)
    update_resp = supabase.table("personal").update({"is_active": not actual}).eq("id", id_personal).execute()
    if not update_resp.data:
        raise HTTPException(status_code=500, detail="No se pudo actualizar el estado.")
    return update_resp.data[0]
