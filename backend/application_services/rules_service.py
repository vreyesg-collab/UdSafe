from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional
from pydantic import BaseModel

from supabase import create_client, ClientOptions
from database import supabase, supabase_admin, SUPABASE_URL, SUPABASE_KEY
from models import *
from auth import get_current_user, require_jefe, security
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter()

BOGOTA_TZ = ZoneInfo("America/Bogota")


class ReglaAccesoCreate(BaseModel):
    nombre: Optional[str] = None
    dias: list[str]
    hora_inicio: str
    hora_fin: str
    tipos_permitidos: list[str]
    activa: bool = True


@router.post(
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


@router.post(
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


@router.get(
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


@router.get("/jefe/vigilantes", summary="Jefe lista todos los vigilantes registrados")
def listar_vigilantes(current_user=Depends(require_jefe)):
    from datetime import timedelta
    try:
        auth_users = supabase_admin.auth.admin.list_users()
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


@router.post("/jefe/vigilantes", status_code=201, summary="Jefe registra un nuevo vigilante")
def crear_vigilante_jefe(data: RegistroVigilanteRequest, current_user=Depends(require_jefe)):
    try:
        auth_resp = supabase_admin.auth.admin.create_user({
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


@router.get("/jefe/turnos", summary="Jefe lista todos los turnos con filtros opcionales")
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


@router.get("/jefe/reglas-acceso", summary="Jefe lista las reglas de control de acceso")
def listar_reglas_ca(current_user=Depends(require_jefe)):
    resp = supabase.table("reglas_acceso").select("*").order("created_at", desc=False).execute()
    return resp.data or []


@router.post("/jefe/reglas-acceso", status_code=201, summary="Jefe crea una nueva regla de control de acceso")
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


@router.put("/jefe/reglas-acceso/{id_regla}", summary="Jefe actualiza una regla de control de acceso")
def actualizar_regla_ca(id_regla: str, data: ReglaAccesoCreate, current_user=Depends(require_jefe)):
    update = data.model_dump(exclude_none=False)
    resp = supabase.table("reglas_acceso").update(update).eq("id", id_regla).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Regla no encontrada.")
    return resp.data[0]


@router.patch("/jefe/reglas-acceso/{id_regla}/toggle", summary="Jefe activa o desactiva una regla")
def toggle_regla_ca(id_regla: str, current_user=Depends(require_jefe)):
    regla_resp = supabase.table("reglas_acceso").select("id, activa").eq("id", id_regla).execute()
    if not regla_resp.data:
        raise HTTPException(status_code=404, detail="Regla no encontrada.")
    actual = regla_resp.data[0].get("activa", True)
    resp = supabase.table("reglas_acceso").update({"activa": not actual}).eq("id", id_regla).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="No se pudo actualizar la regla.")
    return resp.data[0]


@router.delete("/jefe/reglas-acceso/{id_regla}", status_code=204, summary="Jefe elimina una regla de control de acceso")
def eliminar_regla_ca(id_regla: str, current_user=Depends(require_jefe)):
    resp = supabase.table("reglas_acceso").delete().eq("id", id_regla).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Regla no encontrada.")
