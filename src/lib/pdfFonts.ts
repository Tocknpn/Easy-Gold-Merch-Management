// ── Lao font assets for the PDF exports (used by `pdfExport.ts`) ───────────
// jsPDF's built-in fonts (helvetica / times / courier) are WinAnsi encoded and
// carry no Lao code points at all: Lao item names came out as mojibake and the
// Kip sign `₭` (U+20AD) could not be drawn either.
//
// `public/fonts/NotoSansLao-{Regular,Bold}.ttf` are static (glyf) Noto Sans Lao
// builds from https://notofonts.github.io/lao/ — 35 kB / 37 kB, Lao script +
// `₭`, no Latin (Latin in the same string is drawn with Helvetica). They are
// loaded once per session and used two ways:
//
//   • base64 → jsPDF's vFS (`addFileToVFS` + `addFont`) so `₭` is real,
//     selectable, vector text in the report.
//   • ArrayBuffer → `FontFace` on `document.fonts` so the offscreen canvas in
//     `pdfLaoText.ts` can rasterise the ITEM names with correct Lao shaping
//     (jsPDF has no OpenType shaping — see the note in `pdfLaoText.ts`).
export interface LaoFontAssets {
  regularB64: string;
  boldB64: string;
}

/** Canvas font-family registered from the same files (see `pdfLaoText.ts`). */
export const LAO_CANVAS_FAMILY = 'EGLaoPdf';
/** jsPDF family name the TTFs are registered under. */
export const LAO_PDF_FONT = 'NotoSansLaoPDF';

const REGULAR_URL = '/fonts/NotoSansLao-Regular.ttf';
const BOLD_URL = '/fonts/NotoSansLao-Bold.ttf';

/** btoa() over a byte array — chunked so large fonts never blow the arg limit. */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the Lao font (${res.status} ${url})`);
  return res.arrayBuffer();
}

/** Hands the bytes to the browser text engine so canvas can shape Lao runs. */
async function registerCanvasFace(regular: ArrayBuffer, bold: ArrayBuffer) {
  if (typeof FontFace === 'undefined') return;
  try {
    const [r, b] = await Promise.all([
      new FontFace(LAO_CANVAS_FAMILY, regular).load(),
      new FontFace(LAO_CANVAS_FAMILY, bold, { weight: '700' }).load(),
    ]);
    document.fonts.add(r);
    document.fonts.add(b);
  } catch {
    // Canvas falls back to the Google-hosted "Noto Sans Lao" already in
    // index.html — the PDF itself still gets the embedded font below.
  }
}

let pending: Promise<LaoFontAssets> | null = null;

async function load(): Promise<LaoFontAssets> {
  const [regular, bold] = await Promise.all([fetchFont(REGULAR_URL), fetchFont(BOLD_URL)]);
  await registerCanvasFace(regular, bold);
  return { regularB64: toBase64(regular), boldB64: toBase64(bold) };
}

/**
 * Loads (once) and caches both Lao fonts. Rejects — and retries on the next
 * call — when the files cannot be fetched, so a PDF export never silently
 * falls back to the garbled WinAnsi rendering.
 */
export function loadLaoFonts(): Promise<LaoFontAssets> {
  if (!pending) {
    pending = load().catch((err) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}
