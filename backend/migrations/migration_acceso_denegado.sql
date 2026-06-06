-- Permitir registrar accesos denegados de códigos no registrados en personal.
-- id_personal pasa a ser nullable para no bloquear el INSERT cuando el código
-- escaneado no existe en la tabla personal.
ALTER TABLE public.acceso
  ALTER COLUMN id_personal DROP NOT NULL;
