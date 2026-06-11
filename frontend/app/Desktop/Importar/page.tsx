"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cargarSesion, importarPersonal } from "../../../lib/api";

type EstadoImport = "idle" | "listo" | "subiendo" | "resultado";

interface ResultadoImport {
  total: number;
  insertados: number;
  omitidos: number;
  errores: { fila: number; motivo: string }[];
}

const TIPOS_VALIDOS = ["estudiante", "docente", "administrativo", "servicios_generales", "visitante"];

export default function ImportarPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoImport>("idle");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sesion = cargarSesion();
    if (!sesion || sesion.rol !== "jefe_seguridad") router.replace("/login");
  }, [router]);

  function seleccionarArchivo(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      setError("Formato no soportado. Usa un archivo .csv o .xlsx");
      return;
    }
    setArchivo(f);
    setEstado("listo");
    setError("");
    setResultado(null);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) seleccionarArchivo(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) seleccionarArchivo(f);
  }

  async function handleImportar() {
    if (!archivo) return;
    setEstado("subiendo");
    setError("");
    try {
      const res = await importarPersonal(archivo);
      setResultado(res);
      setEstado("resultado");
    } catch (err: any) {
      setError(err.message || "Error al procesar el archivo.");
      setEstado("listo");
    }
  }

  function reiniciar() {
    setArchivo(null);
    setResultado(null);
    setError("");
    setEstado("idle");
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Importar datos</h1>
        <p className="text-sm text-slate-500 mt-0.5">Carga registros de personal desde un archivo CSV o Excel</p>
      </div>

      {/* Estructura esperada */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-5">
        <p className="text-xs font-semibold text-slate-700 mb-3">Estructura requerida del archivo</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {["nombre", "tipo", "codigo_institucional", "is_active"].map((col) => (
                  <th key={col} className="text-left px-3 py-2 font-semibold text-slate-600 font-mono">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-50">
                <td className="px-3 py-2 text-slate-500">Juan Pérez</td>
                <td className="px-3 py-2 text-slate-500">estudiante</td>
                <td className="px-3 py-2 text-slate-500 font-mono">2024001</td>
                <td className="px-3 py-2 text-slate-500">true</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-500">María López</td>
                <td className="px-3 py-2 text-slate-500">docente</td>
                <td className="px-3 py-2 text-slate-500 font-mono">DOC-042</td>
                <td className="px-3 py-2 text-slate-500">true</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <p className="text-[11px] text-slate-400 w-full mb-0.5">Valores válidos para <span className="font-mono font-semibold text-slate-600">tipo</span>:</p>
          {TIPOS_VALIDOS.map((t) => (
            <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-mono">{t}</span>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          La columna <span className="font-mono font-semibold text-slate-600">is_active</span> es opcional — si se omite, todos los registros se crean como activos.
        </p>
      </div>

      {/* Zona de carga */}
      {estado !== "resultado" && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-4">
          <p className="text-xs font-semibold text-slate-700 mb-3">Seleccionar archivo</p>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : archivo
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={onInputChange}
            />

            {archivo ? (
              <>
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-800">{archivo.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{(archivo.size / 1024).toFixed(1)} KB · haz clic para cambiar</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700">Arrastra tu archivo aquí</p>
                  <p className="text-xs text-slate-400 mt-0.5">o haz clic para seleccionarlo · CSV, XLSX</p>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
          )}

          {archivo && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleImportar}
                disabled={estado === "subiendo"}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {estado === "subiendo" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    Importar archivo
                  </>
                )}
              </button>
              <button
                onClick={reiniciar}
                disabled={estado === "subiendo"}
                className="px-4 py-2.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors font-medium"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resultado */}
      {estado === "resultado" && resultado && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-sm font-bold text-slate-800 mb-4">Resultado de la importación</p>

          {/* Métricas */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Filas leídas", value: resultado.total, color: "text-slate-800" },
              { label: "Insertados", value: resultado.insertados, color: "text-emerald-600" },
              { label: "Omitidos", value: resultado.omitidos, color: resultado.omitidos > 0 ? "text-red-500" : "text-slate-400" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-4 text-center">
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Banner de éxito o parcial */}
          {resultado.omitidos === 0 ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Todos los registros fueron importados correctamente.
            </div>
          ) : resultado.insertados > 0 ? (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              Importación parcial — revisa los errores a continuación.
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              No se pudo insertar ningún registro. Revisa el formato del archivo.
            </div>
          )}

          {/* Lista de errores */}
          {resultado.errores.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Filas con errores ({resultado.errores.length}{resultado.omitidos > 50 ? "+" : ""})
              </p>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {resultado.errores.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 bg-red-50 rounded-xl px-3 py-2.5 text-xs">
                    <span className="font-mono font-bold text-red-500 shrink-0">Fila {e.fila}</span>
                    <span className="text-red-700">{e.motivo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={reiniciar}
            className="mt-4 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
          >
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
