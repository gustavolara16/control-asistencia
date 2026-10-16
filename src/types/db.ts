// Tipos de las filas de la base de datos (ver supabase/migrations).
// Mantener sincronizados con el SQL al agregar columnas.

export type Rol = "admin" | "empleado";
export type TipoMarcacion = "entrada" | "salida";
export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada";

export type PerfilRow = {
  id: string;
  nombre_completo: string;
  /** Usuario de ingreso de los empleados (null para administradores). */
  usuario: string | null;
  rol: Rol;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

// Columnas de locales legibles desde la app (qr_token solo se obtiene con la
// función qr_token_local, reservada al administrador).
export const COLUMNAS_LOCAL =
  "id, nombre, direccion, latitud, longitud, radio_metros, tolerancia_minutos, activo, created_at, updated_at";

export type LocalRow = {
  id: string;
  nombre: string;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  radio_metros: number;
  tolerancia_minutos: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type HorarioRow = {
  id: string;
  perfil_id: string;
  local_id: string;
  /** 1 = lunes … 7 = domingo */
  dia_semana: number;
  /** "HH:MM:SS" */
  hora_entrada: string;
  hora_salida: string;
};

export type MarcacionRow = {
  id: number;
  perfil_id: string;
  local_id: string;
  tipo: TipoMarcacion;
  registrada_en: string;
  origen: "qr_gps" | "admin";
  anulada: boolean;
};

export type SolicitudRow = {
  id: number;
  perfil_id: string;
  /** Marcación a corregir, o null si se pide agregar una que faltó. */
  marcacion_id: number | null;
  local_id: string | null;
  tipo: TipoMarcacion | null;
  fecha_hora_propuesta: string;
  motivo: string;
  estado: EstadoSolicitud;
  revisada_por: string | null;
  revisada_en: string | null;
  respuesta: string | null;
  created_at: string;
};
