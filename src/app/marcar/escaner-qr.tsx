"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { claseBotonPrimario, claseTarjeta } from "@/components/ui/estilos";
import { extraerCodigoQr } from "@/lib/qr";

// BarcodeDetector existe en Chrome para Android, pero todavía no está en los
// tipos de TypeScript.
type Detector = { detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (opciones: { formats: string[] }) => Detector;

function obtenerDetector(): DetectorConstructor | null {
  return (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector ?? null;
}

export function EscanerQr() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<"inicio" | "escaneando" | "sin-soporte" | "error">("inicio");
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Apaga la cámara (y la búsqueda) al salir de la pantalla.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    [],
  );

  async function abrirCamara() {
    const BarcodeDetector = obtenerDetector();
    if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setEstado("sin-soporte");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setEstado("escaneando");

      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const buscar = async () => {
        if (!streamRef.current) return;
        try {
          const codigos = await detector.detect(video);
          for (const { rawValue } of codigos) {
            const codigo = extraerCodigoQr(rawValue);
            if (codigo) {
              stream.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
              router.replace(`/marcar?qr=${codigo}`);
              return;
            }
            setMensaje("Ese código QR no es de un local. Apuntá al QR de asistencia.");
          }
        } catch {
          // Cuadro no disponible todavía: se reintenta.
        }
        setTimeout(buscar, 300);
      };
      buscar();
    } catch {
      setEstado("error");
    }
  }

  return (
    <section className={`${claseTarjeta} flex flex-col gap-4`}>
      <h1 className="text-xl font-semibold text-slate-900">Escaneá el QR del local</h1>

      <video
        ref={videoRef}
        playsInline
        muted
        className={`aspect-square w-full rounded-xl bg-slate-900 object-cover ${estado === "escaneando" ? "" : "hidden"}`}
      />

      {estado === "inicio" && (
        <>
          <p className="text-sm text-slate-600">Apuntá la cámara al código QR que está pegado en el local.</p>
          <button type="button" onClick={abrirCamara} className={`${claseBotonPrimario} h-14 text-base`}>
            Abrir cámara
          </button>
        </>
      )}
      {estado === "escaneando" && <p className="text-sm text-slate-600">Buscando el código…</p>}
      {mensaje && estado === "escaneando" && <p className="text-sm text-amber-700">{mensaje}</p>}
      {(estado === "sin-soporte" || estado === "error") && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {estado === "error"
            ? "No se pudo abrir la cámara. Revisá el permiso de cámara del navegador."
            : "Este navegador no puede leer QR desde la app."}{" "}
          Abrí la <strong>cámara del celular</strong>, apuntá al código QR del local y tocá el enlace que aparece.
        </p>
      )}
    </section>
  );
}
