from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional

from database import supabase
from models import *
from auth import get_current_user, require_jefe

router = APIRouter()

BOGOTA_TZ = ZoneInfo("America/Bogota")


@router.get(
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


@router.post(
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


@router.get(
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


@router.patch(
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
