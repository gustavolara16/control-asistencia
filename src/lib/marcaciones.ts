import type { TipoMarcacion } from "@/types/db";

// Igual que en la base (registrar_marcacion): una entrada sin salida de hace
// más de 18 h se considera olvidada y ya no cuenta como "abierta".
export const HORAS_ENTRADA_ABIERTA = 18;

export function esEntradaAbierta(ultima: { tipo: TipoMarcacion; registrada_en: string } | null | undefined): boolean {
  if (ultima?.tipo !== "entrada") return false;
  const antiguedad = Date.now() - new Date(ultima.registrada_en).getTime();
  return antiguedad < HORAS_ENTRADA_ABIERTA * 60 * 60 * 1000;
}
