// ── PDF export — Month End Stock Report (jsPDF + jspdf-autotable) ──────────
// The layout mirrors the Excel form Finance signs off: ITEM · UNIT · UNIT
// PRICE, the four movement blocks (OPENING BALANCE / STOCK IN / STOCK OUT /
// CLOSING BALANCE, QTY + VALUE each), REMARK, a TOTAL footer row and four
// signature boxes (CREATED BY / REVIEWED BY / LINE MANAGER / ACCOUNTING).
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
const PAD = 1.2;                     // mm — cell padding
const ROW_H = 6;                     // mm — fixed Excel-like row pitch
const MM_PER_PT = 0.3528;
const BASELINE_DROP = BODY_FONT * MM_PER_PT * 0.36; // digits sit visually centred
const META_BASELINE = 25;            // mm — baseline of the warehouse/category line
const TABLE_Y = 29;                  // first row, below the title block
const SIGN_H = 26;                   // mm — signature box height
const GRID: [number, number, number] = [148, 163, 184];
const SIGN_LABELS = ['CREATED BY', 'REVIEWED BY', 'LINE MANAGER', 'ACCOUNTING'];

/** Column widths (mm): 50+14+22 + 4×(18+25) + 17 = 275 ≤ 277 usable. */
const COL_W = [50, 14, 22, 18, 25, 18, 25, 18, 25, 18, 25, 17];
const ITEM_COL = 0;
const UNIT_COL = 1;
/** Columns drawn by hand as `₭` + digits (see `drawCell`). */
const MONEY_COLS = new Set([2, 4, 6, 8, 10]);

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
  doc.text(title, PAGE_W / 2, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`Period: ${dateRange}`, PAGE_W / 2, 20, { align: 'center' });

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
function drawCell(rasters: Map<string, LaoRaster>) {
  return (data: CellHookData) => {
    const { doc, cell, section, column } = data;
    const col = column.index;

    if (section === 'body' && (col === ITEM_COL || col === UNIT_COL)) {
      const bmp = rasters.get(String(cell.raw ?? ''));
      if (bmp) {
        const x = col === ITEM_COL ? cell.x + PAD : cell.x + (cell.width - bmp.wMm) / 2;
        const y = cell.y + (cell.height - bmp.hMm) / 2;
        // Stable alias → jsPDF stores each name once however often it repeats.
        doc.addImage(bmp.dataUrl, 'PNG', x, y, bmp.wMm, bmp.hMm, bmp.alias);
      }
      return;
    }

    if (MONEY_COLS.has(col) && section !== 'head') {
      const bold = section === 'foot';
      const right = cell.x + cell.width - PAD;
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

function addTable(doc: jsPDF, opts: PdfOptions, rasters: Map<string, LaoRaster>) {
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
      font: 'helvetica', fontSize: BODY_FONT, cellPadding: PAD, minCellHeight: ROW_H,
      valign: 'middle', textColor: [30, 41, 59], lineColor: GRID, lineWidth: 0.15,
      overflow: 'ellipsize',
    },
    headStyles: { fillColor: [248, 250, 252], textColor: [51, 65, 85], fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'right' },
    columnStyles,
    showFoot: 'lastPage',
    didParseCell: parseCell(rasters),
    didDrawCell: drawCell(rasters),
  });
}

/** Four signature boxes, moved to a fresh page when the table ends too low. */
function addSignatures(doc: jsPDF, finalY: number) {
  const gap = 4;
  const boxW = (PAGE_W - 2 * MARGIN - gap * 3) / 4;
  let top = finalY + 10;
  if (top + SIGN_H > PAGE_H - MARGIN - 8) {
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
    doc.text(label, x + boxW / 2, top + 6, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Name: .....................', x + 4, top + 14);
    doc.text('Date ....../....../..........', x + 4, top + 21);
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
  const rasters = rasterizeAll([
    { text: metaLine(opts), pt: META_FONT, maxWMm: PAGE_W - 2 * MARGIN },
    ...opts.rows.flatMap((r) => [
      { text: r.sku.name, pt: BODY_FONT, maxWMm: COL_W[ITEM_COL] - PAD * 2 },
      { text: r.sku.unit || 'pcs', pt: BODY_FONT, maxWMm: COL_W[UNIT_COL] - PAD * 2 },
    ]),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  registerLaoFonts(doc, fonts);
  addHeader(doc, opts, rasters);
  addTable(doc, opts, rasters);
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
