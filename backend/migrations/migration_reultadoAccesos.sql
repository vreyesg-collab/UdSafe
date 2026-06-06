-- Agregar campo resultado con valor por defecto 'pendiente'
ALTER TABLE public.acceso
ADD COLUMN resultado text NOT NULL DEFAULT 'pendiente'
  CHECK (resultado = ANY (ARRAY['permitido', 'denegado', 'pendiente']));

-- Primero poblar el campo resultado en registros existentes
UPDATE public.acceso SET resultado = 'permitido';

-- Luego agregar la constraint
ALTER TABLE public.acceso
ADD CONSTRAINT chk_resultado_normal
  CHECK (
    tipo_acceso = 'especial'
    OR resultado IN ('permitido', 'denegado')
  );

-- Agregar referencia al jefe que valida (solo para accesos especiales)
ALTER TABLE public.acceso
ADD COLUMN id_jefe_validador uuid
  REFERENCES public.jefes_seguridad(id);

-- Agregar timestamp de cuando se realizó la validación
ALTER TABLE public.acceso
ADD COLUMN fecha_validacion timestamp with time zone;

-- Fijar todos los registros existentes como permitidos
UPDATE public.acceso SET resultado = 'permitido';

-- Garantizar que accesos normales nunca queden en 'pendiente'
ALTER TABLE public.acceso
ADD CONSTRAINT chk_resultado_normal
  CHECK (
    tipo_acceso = 'especial'
    OR resultado IN ('permitido', 'denegado')
  );

-- Garantizar que accesos normales no tengan jefe validador ni fecha de validación
ALTER TABLE public.acceso
ADD CONSTRAINT chk_campos_especial
  CHECK (
    tipo_acceso = 'especial'
    OR (id_jefe_validador IS NULL AND fecha_validacion IS NULL)
  );

-- Garantizar que si hay resultado definitivo en acceso especial,
-- siempre exista jefe validador y fecha de validación
ALTER TABLE public.acceso
ADD CONSTRAINT chk_validacion_completa
  CHECK (
    resultado = 'pendiente'
    OR (id_jefe_validador IS NOT NULL AND fecha_validacion IS NOT NULL)
  );