// Tipos de las filas de la base de datos (ver supabase/migrations).
// Mantener sincronizados con el SQL al agregar columnas.

export type Rol = "admin" | "empleado";
export type TipoMarcacion = "entrada" | "salida";
export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada";

export type PerfilRow = {
  id: string;
  nombre_completo: string;
  rol: Rol;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

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
