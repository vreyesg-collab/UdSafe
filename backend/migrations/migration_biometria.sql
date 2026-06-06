-- Tabla para almacenar el descriptor facial del personal registrado.
-- La comparación se realiza en Python con distancia coseno (no requiere pgvector).
CREATE TABLE public.biometria_personal (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  id_personal     uuid        NOT NULL,
  foto_referencia text        NOT NULL,
  face_embedding  float[]     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biometria_personal_pkey PRIMARY KEY (id),
  CONSTRAINT biometria_personal_personal_uq UNIQUE (id_personal),
  CONSTRAINT biometria_personal_id_personal_fkey
    FOREIGN KEY (id_personal) REFERENCES public.personal(id) ON DELETE CASCADE
);
