-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cedula text NOT NULL UNIQUE,
  correo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  CONSTRAINT usuarios_pkey PRIMARY KEY (id)
);
CREATE TABLE public.vigilantes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  turno boolean NOT NULL DEFAULT false,
  CONSTRAINT vigilantes_pkey PRIMARY KEY (id),
  CONSTRAINT vigilantes_id_fkey FOREIGN KEY (id) REFERENCES public.usuarios(id)
);
CREATE TABLE public.jefes_seguridad (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telefono text NOT NULL,
  CONSTRAINT jefes_seguridad_pkey PRIMARY KEY (id),
  CONSTRAINT jefes_seguridad_id_fkey FOREIGN KEY (id) REFERENCES public.usuarios(id)
);
CREATE TABLE public.personal (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo_institucional text NOT NULL UNIQUE,
  nombre text NOT NULL,
  tipo USER-DEFINED NOT NULL,
  CONSTRAINT personal_pkey PRIMARY KEY (id)
);
CREATE TABLE public.acceso (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  id_personal uuid NOT NULL,
  id_vigilante uuid NOT NULL,
  modalidad text NOT NULL,
  observacion text,
  tipo_acceso text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT acceso_pkey PRIMARY KEY (id),
  CONSTRAINT acceso_id_personal_fkey FOREIGN KEY (id_personal) REFERENCES public.personal(id),
  CONSTRAINT acceso_id_vigilante_fkey FOREIGN KEY (id_vigilante) REFERENCES public.vigilantes(id)
);
CREATE TABLE public.alerta (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asunto text NOT NULL,
  estado text NOT NULL,
  fecha_hora timestamp with time zone NOT NULL DEFAULT now(),
  id_emisor uuid NOT NULL,
  observaciones text,
  CONSTRAINT alerta_pkey PRIMARY KEY (id),
  CONSTRAINT alerta_id_emisor_fkey FOREIGN KEY (id_emisor) REFERENCES public.usuarios(id)
);

create table public.turnos (
  id uuid not null default gen_random_uuid (),
  id_vigilante uuid not null,
  fecha_inicio timestamp with time zone not null default now(),
  fecha_fin timestamp with time zone null,
  foto_inicio text not null,
  foto_fin text null,
  estado text not null default 'activo'::text,
  observaciones text null,
  created_at timestamp with time zone not null default now(),
  constraint turnos_pkey primary key (id),
  constraint turnos_id_vigilante_fkey foreign KEY (id_vigilante) references vigilantes (id),
  constraint turnos_estado_check check (
    (
      estado = any (
        array[
          'activo'::text,
          'finalizado'::text,
          'ausente'::text
        ]
      )
    )
  ),
  constraint turnos_fecha_check check (
    (
      (fecha_fin is null)
      or (fecha_fin > fecha_inicio)
    )
  ),
  constraint turnos_foto_fin_check check (
    (
      (estado <> 'finalizado'::text)
      or (foto_fin is not null)
    )
  ),
  constraint turnos_no_solapamiento EXCLUDE using gist (
    id_vigilante
    with
      =,
      tstzrange (
        fecha_inicio,
        COALESCE(fecha_fin, 'infinity'::timestamp with time zone)
      )
    with
      &&
  )
) TABLESPACE pg_default;

create index IF not exists idx_turnos_vigilante on public.turnos using btree (id_vigilante) TABLESPACE pg_default;

create index IF not exists idx_turnos_estado on public.turnos using btree (estado) TABLESPACE pg_default;

create index IF not exists idx_turnos_fecha_inicio on public.turnos using btree (fecha_inicio) TABLESPACE pg_default;

create index IF not exists idx_turnos_vigilante_estado on public.turnos using btree (id_vigilante, estado) TABLESPACE pg_default;

create trigger trg_sync_turno
after INSERT
or
update OF estado on turnos for EACH row
execute FUNCTION sync_turno_vigilante ();