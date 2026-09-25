// ── PDF export — Month End Stock Report (jsPDF + jspdf-autotable) ──────────
// The layout mirrors the Excel form Finance signs off: ITEM · UNIT · UNIT
// PRICE, the four movement blocks (OPENING BALANCE / STOCK IN / STOCK OUT /
// CLOSING BALANCE, QTY + VALUE each), REMARK, a TOTAL footer row and four
// signature boxes (CREATED BY / REVIEWED BY / LINE MANAGER / ACCOUNTING).
// The row pitch is solved from the row count so the signed form stays on ONE
// A4 landscape page (see the one-page-fit note further down); a report with
// more SKUs than the tightest readable pitch allows keeps the roomy 6 mm rows
// and paginates, with the signature block on the last page.
//
// Lao support lives in two helpers (see their module notes):
//   • `pdfFonts.ts`  — embeds Noto Sans Lao so `₭` is real vector text.
//     jsPDF's built-in helvetica is WinAnsi encoded: it has no Kip sign, and
//     no Lao code point at all (that is why names used to print as mojibake).
//   • `pdfLaoText.ts` — rasterises the ITEM names with the browser's text
//     engine, because jsPDF does no OpenType shaping and would place Lao tone
//     marks beside the consonant. Numbers/headers stay selectable text.
import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type RowInput, type Styles } from 'jspdf-autotable';
import { CURRENCY } from './types';
import { fmt, money } from './utils';
import type { MonthEndRow } from './stockMovement';
import { loadLaoFonts, LAO_PDF_FONT, type LaoFontAssets } from './pdfFonts';
import { rasterizeAll, type LaoRaster } from './pdfLaoText';

export interface PdfOptions {
  title: string;
  dateRange: string;
  warehouse: string;
  category: string;
  includeVat: boolean;
  rows: MonthEndRow[];
  totalOpening: { qty: number; val: number };
  totalStockIn: { qty: number; val: number };
  totalStockOut: { qty: number; val: number };
  totalClosing: { qty: number; val: number };
}

// A4 landscape, 10 mm margins → 297 × 210 mm with 277 mm of usable width.
const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 10;
const BODY_FONT = 7;                 // pt — same body size as the old export
const META_FONT = 8;                 // pt — the warehouse/category line
const MM_PER_PT = 0.3528;
const BASELINE_DROP = BODY_FONT * MM_PER_PT * 0.36; // digits sit visually centred
const GRID: [number, number, number] = [148, 163, 184];
const SIGN_LABELS = ['CREATED BY', 'REVIEWED BY', 'LINE MANAGER', 'ACCOUNTING'];

// ── Vertical geometry, mm from the top of the A4 landscape page ────────────
const TITLE_Y = 12.5;                // baseline of the 16 pt report title
const PERIOD_Y = 18;                 // baseline of the 10 pt period line
const META_BASELINE = 22.5;          // baseline of the warehouse/category line
const TABLE_Y = 24.5;                // first row, below the title block
const SIGN_H = 22;                   // mm — signature box height
const SIGN_GAP = 6;                  // mm — space between the table and the boxes
const FOOTER_CLEAR = 197;            // mm — bottom-most ink, above the footer line

// ── One-page fit ───────────────────────────────────────────────────────────
// The form Finance signs has to reach the signature boxes without a second
// page, so the row pitch is solved from the row count instead of being pinned
// at 6 mm: the title block, the signature block and the gap above it are fixed,
// and what is left is shared by the two grouped head rows, one row per SKU and
// the bold TOTAL foot row. Rows only compress as far as `PITCH_MIN` (a 7 pt
// line plus the tightest padding); a report with more SKUs than that falls back
// to the roomy 6 mm pitch, which paginates exactly as it always did.
const PITCH_MAX = 6;                 // mm — Excel-like pitch, and the fallback
const PITCH_MIN = 4.05;              // mm — floor: 7 pt line + 2 × PAD_MIN
const HEAD_MIN = 4.8;                // mm — the head rows keep at least this height
const PAD_MAX = 1.2;                 // mm — cell padding when the pitch allows it
const PAD_MIN = 0.6;                 // mm — tightest padding, at PITCH_MIN
const LINE_MM = BODY_FONT * MM_PER_PT * 1.15; // autoTable's single-line height
const MIN_INSET = 0.9;               // mm — bitmap / `₭` inset, never tighter
// The solve would otherwise consume the budget to the last micrometre and the
// signature block's `finalY + gap + height > FOOTER_CLEAR` test would tip over
// on floating-point noise, pushing the boxes to a second page.
const FIT_SLACK = 0.5;               // mm — keep the solved table strictly inside

/** Column widths (mm): 50+14+22 + 4×(18+25) + 17 = 275 ≤ 277 usable. */
const COL_W = [50, 14, 22, 18, 25, 18, 25, 18, 25, 18, 25, 17];
const ITEM_COL = 0;
const UNIT_COL = 1;
/** Columns drawn by hand as `₭` + digits (see `drawCell`). */
const MONEY_COLS = new Set([2, 4, 6, 8, 10]);

/** Solved vertical geometry for one export — see the one-page-fit note above. */
interface Layout {
  pitch: number;      // mm — body/foot row pitch (the head uses `headPitch`)
  headPitch: number;  // mm — the two grouped head rows
  pad: number;        // mm — cell padding that makes `pitch` the natural row height
  single: boolean;    // true → the whole signed form fits on one page
}

/**
 * Compress the row pitch until the table plus the signature block fit above
 * `FOOTER_CLEAR`, or report that the report is too long for one page.
 */
function solveLayout(bodyRows: number): Layout {
  const rows = bodyRows + 1;                             // one row per SKU + the TOTAL foot
  const avail = FOOTER_CLEAR - SIGN_H - SIGN_GAP - TABLE_Y - FIT_SLACK;
  let want = Math.min(PITCH_MAX, avail / (rows + 2));    // head rows share the pitch
  if (want < HEAD_MIN) want = (avail - 2 * HEAD_MIN) / rows; // else pin them at HEAD_MIN
  const single = want >= PITCH_MIN;
  const pitch = single ? want : PITCH_MAX;
  // autoTable measures `padding.top + padding.bottom + lineHeight`; a hair under
  // the pitch keeps `minCellHeight` (not the content) in charge of the height.
  const pad = Math.min(PAD_MAX, Math.max(PAD_MIN, (pitch - LINE_MM) / 2 - 0.005));
  return { pitch, headPitch: single ? Math.max(pitch, HEAD_MIN) : PITCH_MAX, pad, single };
}

const columnStyles: Record<number, Partial<Styles>> = {
  0: { halign: 'left', cellWidth: COL_W[0] },
  1: { halign: 'center', cellWidth: COL_W[1] },
  2: { halign: 'right', cellWidth: COL_W[2] },
  3: { halign: 'right', cellWidth: COL_W[3] },
  4: { halign: 'right', cellWidth: COL_W[4] },
  5: { halign: 'right', cellWidth: COL_W[5] },
  6: { halign: 'right', cellWidth: COL_W[6] },
  7: { halign: 'right', cellWidth: COL_W[7] },
  8: { halign: 'right', cellWidth: COL_W[8] },
  9: { halign: 'right', cellWidth: COL_W[9] },
  10: { halign: 'right', cellWidth: COL_W[10] },
  11: { halign: 'center', cellWidth: COL_W[11] },
};

/** Movement-block band on the first head row (light tint + matching ink). */
const band = (
  fill: [number, number, number],
  text: [number, number, number],
): Partial<Styles> => ({ fillColor: fill, textColor: text, halign: 'center', fontStyle: 'bold' });

/** Register the embedded Lao font so `₭` prints as text instead of garbage. */
function registerLaoFonts(doc: jsPDF, fonts: LaoFontAssets) {
  doc.addFileToVFS('NotoSansLao-Regular.ttf', fonts.regularB64);
  doc.addFont('NotoSansLao-Regular.ttf', LAO_PDF_FONT, 'normal');
  doc.addFileToVFS('NotoSansLao-Bold.ttf', fonts.boldB64);
  doc.addFont('NotoSansLao-Bold.ttf', LAO_PDF_FONT, 'bold');
}

/** `Warehouse: … | Category: …` — a Lao category name must not print as junk. */
const metaLine = (opts: PdfOptions) =>
  `Warehouse: ${opts.warehouse} | Category: ${opts.category}${opts.includeVat ? ' | Including VAT 10%' : ''}`;

function addHeader(doc: jsPDF, opts: PdfOptions, rasters: Map<string, LaoRaster>) {
  const { title, dateRange } = opts;
  const meta = metaLine(opts);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(title, PAGE_W / 2, TITLE_Y, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`Period: ${dateRange}`, PAGE_W / 2, PERIOD_Y, { align: 'center' });

  // The meta line stays vector text unless its contents need Lao glyphs.
  const bmp = rasters.get(meta);
  if (bmp) {
    const descent = META_FONT * MM_PER_PT * 0.28;
    doc.addImage(
      bmp.dataUrl, 'PNG',
      (PAGE_W - bmp.wMm) / 2, META_BASELINE + descent - bmp.hMm, bmp.wMm, bmp.hMm,
      bmp.alias,
    );
  } else {
    doc.setFontSize(META_FONT);
    doc.setTextColor(100, 116, 139);
    doc.text(meta, PAGE_W / 2, META_BASELINE, { align: 'center' });
  }
}

/** REMARK: ledger-drift marker when Opening + In − Out ≠ Closing, else a dash. */
const remarkOf = (r: MonthEndRow) =>
  Math.abs(r.variance) > 1e-6 ? `${r.variance > 0 ? '+' : ''}${fmt(Math.round(r.variance))}` : '—';

/**
 * Table body. Money cells carry the raw NUMBER (painted in `drawCell`); the
 * ITEM cell carries the name so the hook can look its bitmap up — both are
 * blanked in `didParseCell` so autoTable only draws the grid for them.
 */
function bodyRows(rows: MonthEndRow[]): RowInput[] {
  return rows.map((r) => [
    r.sku.name,
    r.sku.unit || 'pcs',
    r.cpu,
    fmt(r.openingQty), r.openingVal,
    fmt(r.stockInQty), r.stockInVal,
    fmt(r.stockOutQty), r.stockOutVal,
    fmt(r.closingQty), r.closingVal,
    remarkOf(r),
  ]);
}

function footRow(opts: PdfOptions): RowInput {
  const { totalOpening: o, totalStockIn: i, totalStockOut: s, totalClosing: c } = opts;
  return ['TOTAL', '', '', fmt(o.qty), o.val, fmt(i.qty), i.val, fmt(s.qty), s.val, fmt(c.qty), c.val, '—'];
}

/** Suppress autoTable's own text wherever we paint the content ourselves. */
function parseCell(rasters: Map<string, LaoRaster>) {
  return (data: CellHookData) => {
    if (data.section === 'head') return;
    const col = data.column.index;
    // ITEM / UNIT: only blanked when the string needed a Lao bitmap.
    if ((col === ITEM_COL || col === UNIT_COL) && rasters.has(String(data.cell.raw ?? ''))) {
      data.cell.text = [];
      return;
    }
    if (MONEY_COLS.has(col)) data.cell.text = [];
  };
}

/** Draws the Lao bitmaps (item / unit / meta line) and `₭` + number cells. */
function drawCell(rasters: Map<string, LaoRaster>, layout: Layout) {
  return (data: CellHookData) => {
    const { doc, cell, section, column } = data;
    const col = column.index;
    const inset = Math.max(layout.pad, MIN_INSET);

    if (section === 'body' && (col === ITEM_COL || col === UNIT_COL)) {
      const bmp = rasters.get(String(cell.raw ?? ''));
      if (bmp) {
        const x = col === ITEM_COL ? cell.x + inset : cell.x + (cell.width - bmp.wMm) / 2;
        const y = cell.y + (cell.height - bmp.hMm) / 2;
        // Stable alias → jsPDF stores each name once however often it repeats.
        doc.addImage(bmp.dataUrl, 'PNG', x, y, bmp.wMm, bmp.hMm, bmp.alias);
      }
      return;
    }

    if (MONEY_COLS.has(col) && section !== 'head') {
      const bold = section === 'foot';
      const right = cell.x + cell.width - inset;
      const baseline = cell.y + cell.height / 2 + BASELINE_DROP;
      const digits = money(Number(cell.raw ?? 0)).slice(CURRENCY.length);

      doc.setFontSize(BODY_FONT);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(30, 41, 59);
      const digitsW = doc.getTextWidth(digits);
      doc.text(digits, right, baseline, { align: 'right' });

      // `₭` has no WinAnsi glyph — it comes from the embedded Lao font.
      doc.setFont(LAO_PDF_FONT, bold ? 'bold' : 'normal');
      doc.text(CURRENCY, right - digitsW - 0.3, baseline, { align: 'right' });

      doc.setFont('helvetica', 'normal');
    }
  };
}

function addTable(doc: jsPDF, opts: PdfOptions, rasters: Map<string, LaoRaster>, layout: Layout) {
  const head: RowInput[] = [
    [
      { content: 'ITEM', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
      { content: 'UNIT', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      { content: 'UNIT PRICE', rowSpan: 2, styles: { halign: 'right', valign: 'middle' } },
      { content: 'OPENING BALANCE', colSpan: 2, styles: band([219, 234, 254], [30, 64, 175]) },
      { content: 'STOCK IN', colSpan: 2, styles: band([209, 250, 229], [4, 120, 87]) },
      { content: 'STOCK OUT', colSpan: 2, styles: band([254, 226, 226], [185, 28, 28]) },
      { content: 'CLOSING BALANCE', colSpan: 2, styles: band([226, 232, 240], [15, 23, 42]) },
      { content: 'REMARK', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
    ],
    ['QTY', 'VALUE', 'QTY', 'VALUE', 'QTY', 'VALUE', 'QTY', 'VALUE']
      .map((label) => ({ content: label, styles: { halign: 'right' as const } })),
  ];

  autoTable(doc, {
    head,
    body: bodyRows(opts.rows),
    foot: [footRow(opts)],
    startY: TABLE_Y,
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 12 },
    theme: 'grid',
    styles: {
      font: 'helvetica', fontSize: BODY_FONT, cellPadding: layout.pad, minCellHeight: layout.pitch,
      valign: 'middle', textColor: [30, 41, 59], lineColor: GRID, lineWidth: 0.15,
      overflow: 'ellipsize',
    },
    headStyles: { fillColor: [248, 250, 252], textColor: [51, 65, 85], fontStyle: 'bold', halign: 'center', minCellHeight: layout.headPitch },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'right' },
    columnStyles,
    showFoot: 'lastPage',
    didParseCell: parseCell(rasters),
    didDrawCell: drawCell(rasters, layout),
  });
}

/** Four signature boxes, moved to a fresh page when the table ends too low. */
function addSignatures(doc: jsPDF, finalY: number) {
  const gap = 4;
  const boxW = (PAGE_W - 2 * MARGIN - gap * 3) / 4;
  let top = finalY + SIGN_GAP;
  if (top + SIGN_H > FOOTER_CLEAR) {
    doc.addPage();
    top = MARGIN + 6;
  }

  doc.setDrawColor(GRID[0], GRID[1], GRID[2]);
  doc.setLineWidth(0.2);
  SIGN_LABELS.forEach((label, i) => {
    const x = MARGIN + i * (boxW + gap);
    doc.roundedRect(x, top, boxW, SIGN_H, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(label, x + boxW / 2, top + 5.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Name: .....................', x + 4, top + 13);
    doc.text('Date ....../....../..........', x + 4, top + 19.5);
  });
}

/** Generated-on + system name; page numbers only when the report spills over. */
function addFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const stamp = new Date().toLocaleString();

  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated on ${stamp}`, MARGIN, PAGE_H - 6);
    doc.text('Easy Gold Merch Management System', PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
    if (pages > 1) doc.text(`Page ${p} / ${pages}`, PAGE_W / 2, PAGE_H - 6, { align: 'center' });
  }
}

/** Fonts (embedded + canvas) and the Lao bitmaps, then the document. */
async function buildReport(opts: PdfOptions): Promise<jsPDF> {
  const fonts = await loadLaoFonts();
  const layout = solveLayout(opts.rows.length);
  const inset = Math.max(layout.pad, MIN_INSET);
  const rasters = rasterizeAll([
    { text: metaLine(opts), pt: META_FONT, maxWMm: PAGE_W - 2 * MARGIN },
    ...opts.rows.flatMap((r) => [
      { text: r.sku.name, pt: BODY_FONT, maxWMm: COL_W[ITEM_COL] - inset * 2 },
      { text: r.sku.unit || 'pcs', pt: BODY_FONT, maxWMm: COL_W[UNIT_COL] - inset * 2 },
    ]),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  registerLaoFonts(doc, fonts);
  addHeader(doc, opts, rasters);
  addTable(doc, opts, rasters, layout);
  addSignatures(doc, (doc as any).lastAutoTable?.finalY ?? 150);
  addFooter(doc);
  return doc;
}

/** Download the Month End Stock Report as a PDF file. */
export async function exportMonthEndPdf(opts: PdfOptions): Promise<void> {
  const doc = await buildReport(opts);
  doc.save(`month-end-report-${opts.dateRange.replace(/\s/g, '-')}.pdf`);
}

/** Open the same report in a new tab and send it straight to the printer. */
export async function printMonthEndPdf(opts: PdfOptions): Promise<void> {
  // Claim the tab in the click tick — awaiting the fonts first would give the
  // popup blocker a reason to drop it.
  const win = window.open('', '_blank');
  const doc = await buildReport(opts);
  const url = URL.createObjectURL(doc.output('blob'));

  if (!win) {
    window.open(url, '_blank');
    return;
  }
  win.onload = () => {
    win.focus();
    win.print();
  };
  win.onafterprint = () => URL.revokeObjectURL(url);
  win.location.href = url;
}
