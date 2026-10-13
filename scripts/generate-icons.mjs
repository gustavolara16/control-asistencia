// Genera los íconos PNG de la app (PWA, favicon y Apple) sin dependencias externas.
// Uso: npm run icons
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { dirname } from "node:path";

const BACKGROUND = [15, 118, 110]; // #0f766e
const FOREGROUND = [255, 255, 255];

const OUTPUTS = [
  { path: "public/icons/icon-192.png", size: 192 },
  { path: "public/icons/icon-512.png", size: 512 },
  { path: "src/app/apple-icon.png", size: 180 },
  { path: "src/app/icon.png", size: 48 },
];

// Distancia de un punto a un segmento.
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Círculo con una tilde, dentro de la "zona segura" de los íconos maskable.
function coverage(x, y, size) {
  const u = (x + 0.5) / size;
  const v = (y + 0.5) / size;
  const stroke = 0.028; // mitad del grosor del trazo
  const ring = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.28);
  const check = Math.min(
    distanceToSegment(u, v, 0.39, 0.51, 0.47, 0.59),
    distanceToSegment(u, v, 0.47, 0.59, 0.62, 0.43),
  );
  const distance = Math.min(ring, check) - stroke;
  // Antialias de ~1 píxel.
  return Math.max(0, Math.min(1, 0.5 - distance * size));
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function renderPng(size) {
  const rows = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    rows[rowStart] = 0; // filtro "None"
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, size);
      for (let c = 0; c < 3; c++) {
        rows[rowStart + 1 + x * 3 + c] = Math.round(BACKGROUND[c] * (1 - a) + FOREGROUND[c] * a);
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = 2; // RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const { path, size } of OUTPUTS) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderPng(size));
  console.log(`✓ ${path} (${size}x${size})`);
}
