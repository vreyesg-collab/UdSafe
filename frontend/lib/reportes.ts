import type { RegistroAccesoEvento, DashboardStatsResponse } from "./types";

const INSTITUCION = "Universidad Distrital Francisco José de Caldas";

const CSS_BASE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 32px; font-size: 12px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 16px; }
  .logo { font-size: 20px; font-weight: 800; color: #2563eb; }
  .logo-sub { font-size: 10px; color: #64748b; margin-top: 3px; }
  .meta { text-align: right; }
  .meta-title { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 3px; }
  .meta-sub { font-size: 11px; color: #64748b; }
  .stats { display: grid; gap: 12px; margin-bottom: 24px; }
  .stats-4 { grid-template-columns: repeat(4, 1fr); }
  .stats-3 { grid-template-columns: repeat(3, 1fr); }
  .stat { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #94a3b8; font-weight: 700; }
  .stat-value { font-size: 22px; font-weight: 800; margin-top: 2px; }
  .stat-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .filtros { font-size: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 14px; margin-bottom: 20px; color: #64748b; }
  .section-title { font-size: 12px; font-weight: 700; margin-bottom: 8px; color: #334155; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f8fafc; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700; padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11px; color: #334155; }
  tr:last-child td { border-bottom: none; }
  .e-autorizado { color: #059669; font-weight: 600; }
  .e-denegado { color: #dc2626; font-weight: 600; }
  .e-especial { color: #d97706; font-weight: 600; }
  @media print { body { padding: 0; } @page { margin: 15mm; } }
`;

function abrirImpresion(html: string) {
  const w = window.open("", "_blank", "width=1000,height=750");
  if (!w) { alert("Permite ventanas emergentes para generar el PDF."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

export function exportarPDFRapido(stats: DashboardStatsResponse, periodo: string) {
  const total = stats.total_accesos;
  const autorizados = stats.autorizados;
  const denegados = stats.denegados;
  const tasaAprob = total > 0 ? ((autorizados / total) * 100).toFixed(1) : "0";
  const tasaRech = total > 0 ? ((denegados / total) * 100).toFixed(1) : "0";
  const fecha = new Date().toLocaleDateString("es-CO", { dateStyle: "full" });

  const filas = stats.events.map(ev => `
    <tr>
      <td>${ev.persona}</td>
      <td>${ev.tipo}</td>
      <td>${ev.metodo}</td>
      <td>${ev.porteria}</td>
      <td>${ev.hora}</td>
      <td class="e-${ev.estado.toLowerCase()}">${ev.estado}</td>
    </tr>`).join("") || `<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">Sin eventos en este periodo</td></tr>`;

  abrirImpresion(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Reporte UDSafe — ${periodo}</title><style>${CSS_BASE}</style></head>
    <body>
      <div class="header">
        <div><div class="logo">UD-Safe</div><div class="logo-sub">${INSTITUCION}</div></div>
        <div class="meta"><div class="meta-title">Reporte general de accesos</div>
          <div class="meta-sub">Periodo: ${periodo} &nbsp;·&nbsp; ${fecha}</div></div>
      </div>
      <div class="stats stats-3">
        <div class="stat"><div class="stat-label">Total de accesos</div>
          <div class="stat-value">${total.toLocaleString()}</div>
          <div class="stat-sub">Periodo: ${periodo}</div></div>
        <div class="stat"><div class="stat-label">Autorizados</div>
          <div class="stat-value" style="color:#059669">${autorizados.toLocaleString()}</div>
          <div class="stat-sub">${tasaAprob}% tasa de aprobación</div></div>
        <div class="stat"><div class="stat-label">Denegados</div>
          <div class="stat-value" style="color:#dc2626">${denegados.toLocaleString()}</div>
          <div class="stat-sub">${tasaRech}% tasa de rechazo</div></div>
      </div>
      <div class="section-title">Últimos eventos registrados</div>
      <table><thead><tr>
        <th>Persona</th><th>Tipo</th><th>Método</th><th>Portería</th><th>Hora</th><th>Estado</th>
      </tr></thead><tbody>${filas}</tbody></table>
    </body></html>`);
}

export function exportarPDFDetallado(
  eventos: RegistroAccesoEvento[],
  filtros: { periodo: string; tipos: string[]; modalidades: string[]; estado: string }
) {
  const total = eventos.length;
  const autorizados = eventos.filter(e => e.estado === "Autorizado").length;
  const denegados = eventos.filter(e => e.estado === "Denegado").length;
  const especiales = eventos.filter(e => e.estado === "Especial").length;
  const fecha = new Date().toLocaleDateString("es-CO", { dateStyle: "full" });

  const partesFiltro = [
    `Periodo: ${filtros.periodo}`,
    filtros.tipos.length ? `Tipos: ${filtros.tipos.join(", ")}` : null,
    filtros.modalidades.length ? `Modalidades: ${filtros.modalidades.join(", ")}` : null,
    filtros.estado !== "todos" ? `Estado: ${filtros.estado}` : null,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const filas = eventos.map(ev => `
    <tr>
      <td>${ev.nombre}</td>
      <td>${ev.tipo}</td>
      <td>${ev.codigo_institucional}</td>
      <td>${ev.modalidad}</td>
      <td>${ev.porteria}</td>
      <td>${ev.hora}</td>
      <td class="e-${ev.estado.toLowerCase()}">${ev.estado}</td>
    </tr>`).join("") || `<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8">Sin eventos con los filtros seleccionados</td></tr>`;

  abrirImpresion(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Reporte detallado UDSafe</title><style>${CSS_BASE}</style></head>
    <body>
      <div class="header">
        <div><div class="logo">UD-Safe</div><div class="logo-sub">${INSTITUCION}</div></div>
        <div class="meta"><div class="meta-title">Reporte detallado de accesos</div>
          <div class="meta-sub">Generado: ${fecha}</div></div>
      </div>
      ${partesFiltro ? `<div class="filtros">Filtros aplicados: ${partesFiltro}</div>` : ""}
      <div class="stats stats-4">
        <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${total}</div></div>
        <div class="stat"><div class="stat-label">Autorizados</div><div class="stat-value" style="color:#059669">${autorizados}</div></div>
        <div class="stat"><div class="stat-label">Denegados</div><div class="stat-value" style="color:#dc2626">${denegados}</div></div>
        <div class="stat"><div class="stat-label">Especiales</div><div class="stat-value" style="color:#d97706">${especiales}</div></div>
      </div>
      <div class="section-title">Registro de accesos — ${total} eventos</div>
      <table><thead><tr>
        <th>Nombre</th><th>Tipo</th><th>Código</th><th>Modalidad</th><th>Portería</th><th>Hora</th><th>Estado</th>
      </tr></thead><tbody>${filas}</tbody></table>
    </body></html>`);
}

export function exportarCSV(eventos: RegistroAccesoEvento[], filename = "reporte_udsafe.csv") {
  const header = ["Nombre", "Tipo", "Código", "Modalidad", "Tipo Acceso", "Portería", "Estado", "Observación", "Fecha/Hora"];
  const rows = eventos.map(ev => [
    ev.nombre,
    ev.tipo,
    ev.codigo_institucional,
    ev.modalidad,
    ev.tipo_acceso,
    ev.porteria,
    ev.estado,
    ev.observacion ?? "",
    ev.created_at,
  ]);
  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
