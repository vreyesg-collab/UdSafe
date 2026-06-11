from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from datetime import datetime
from zoneinfo import ZoneInfo

from database import supabase
from models import *
from auth import get_current_user, require_jefe

router = APIRouter()

BOGOTA_TZ = ZoneInfo("America/Bogota")


@router.get(
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


@router.get(
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


@router.get(
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


@router.post("/jefe/personal/importar", status_code=200, summary="Jefe importa registros de personal desde CSV o XLSX")
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
