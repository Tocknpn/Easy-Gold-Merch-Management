// ── Lao text rasteriser for the PDF exports ────────────────────────────────
// jsPDF draws glyph by glyph with no OpenType shaping (no GPOS/GSUB), so a Lao
// clause loses its cluster layout: the tone marks (U+0EC8–U+0ECD) and upper
// vowels are zero-width combining glyphs and would be drawn to the RIGHT of the
// consonant instead of above it (the same defect upstream reports for Thai).
// Its built-in fonts are WinAnsi encoded as well, so Lao code points are not
// even addressable.
//
// The browser CAN shape the script, so any string that needs it is drawn on an
// offscreen canvas — with the Lao font registered in `pdfFonts.ts` — and placed
// in the cell as a small bitmap. Latin words inside the same string fall back
// to Inter through the canvas font stack (canvas does per-glyph fallback,
// jsPDF does not). Strings that WinAnsi can already draw are skipped and stay
// selectable vector text.
import { LAO_CANVAS_FAMILY } from './pdfFonts';

/** Supersampling ≈285 dpi: crisp in print, and keeps the PDF a sane size. */
const SCALE = 3;
const MM_PER_PT = 0.3528;

export interface LaoRaster {
  dataUrl: string;
  /** Rendered width in mm (already clamped to the column width). */
  wMm: number;
  /** Rendered height in mm — the caller vertically centres it in the cell. */
  hMm: number;
  /** Stable, ASCII-only alias so jsPDF stores each bitmap exactly once. */
  alias: string;
}

const cache = new Map<string, LaoRaster>();

/** Does this string contain code points helvetica/WinAnsi cannot draw? */
export const needsRaster = (text: string | null | undefined): boolean =>
  /[^\u0000-\u00FF]/.test(String(text ?? ''));

const hash = (s: string): string => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

function draw(text: string, pt: number, maxWMm: number): LaoRaster | null {
  const px = pt * (4 / 3) * SCALE; // pt → CSS px → supersampled
  const stack = `${Math.round(px)}px "${LAO_CANVAS_FAMILY}", Inter, "Noto Sans Lao", system-ui, sans-serif`;

  const canvas = document.createElement('canvas');
  const probe = canvas.getContext('2d');
  if (!probe) return null;

  // Measure first — setting width/height resets the context state.
  probe.font = stack;
  const m = probe.measureText(text);
  const ascent = m.actualBoundingBoxAscent || px * 0.85;
  const descent = m.actualBoundingBoxDescent || px * 0.25;
  const padX = Math.ceil(px * 0.15);
  const w = Math.ceil(m.width + padX * 2);
  const h = Math.ceil(ascent + descent + px * 0.08);
  if (w <= padX * 2 || h <= 0) return null;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Opaque white: the report's cells are white, and an alpha channel would make
  // jsPDF emit an extra soft-mask image per row (double the file size).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.font = stack;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1e293b'; // slate-800 — matches the vector body text
  ctx.fillText(text, padX, ascent);

  const mmPerPx = (pt * MM_PER_PT) / px; // one font em ↔ the point size
  let wMm = w * mmPerPx;
  let hMm = h * mmPerPx;
  if (maxWMm > 0 && wMm > maxWMm) {
    const shrink = maxWMm / wMm;
    wMm *= shrink;
    hMm *= shrink;
  }
  return { dataUrl: canvas.toDataURL('image/png'), wMm, hMm, alias: `img-${pt}-${hash(text)}` };
}

/**
 * Bitmap of one string at `pt`, clamped to `maxWMm`. Cached per size + text for
 * the session (exports repeat the same SKUs). `null` when the canvas is
 * unavailable or the string is blank.
 */
export function rasterizeText(text: string, pt: number, maxWMm: number): LaoRaster | null {
  const value = String(text ?? '');
  if (!value.trim()) return null;

  const key = `${pt}|${value}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const made = draw(value, pt, maxWMm);
  if (made && cache.size < 2000) cache.set(key, made);
  return made;
}

/**
 * Rasterises every entry that WinAnsi cannot draw, keyed by its original text
 * so the table hooks can look a bitmap up straight from `cell.raw`. Strings
 * that only need Latin-1 (plus `—`, `€`, …) are skipped on purpose: autoTable
 * keeps drawing them as searchable text.
 */
export function rasterizeAll(
  items: { text: string; pt: number; maxWMm: number }[],
): Map<string, LaoRaster> {
  const out = new Map<string, LaoRaster>();
  for (const item of items) {
    const text = String(item.text ?? '');
    if (!needsRaster(text) || out.has(text)) continue;
    const made = rasterizeText(text, item.pt, item.maxWMm);
    if (made) out.set(text, made);
  }
  return out;
}

