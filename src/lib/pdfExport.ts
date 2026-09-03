import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmt } from './utils';

export interface MonthEndRow {
  sku: { name: string; category?: string };
  cpu: number;
  openingQty: number;
  openingVal: number;
  stockInQty: number;
  stockInVal: number;
  stockOutQty: number;
  stockOutVal: number;
  closingQty: number;
  closingVal: number;
}

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

function addHeader(doc: jsPDF, opts: PdfOptions) {
  const { title, dateRange, warehouse, category, includeVat } = opts;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${dateRange}`, pageWidth / 2, 22, { align: 'center' });
  doc.text(
    `Warehouse: ${warehouse} | Category: ${category}${includeVat ? ' | Including VAT 10%' : ''}`,
    pageWidth / 2, 28, { align: 'center' }
  );
}

function addTable(doc: jsPDF, rows: MonthEndRow[]) {
  const margin = 15;
  const head = [['No.', 'Item Name', 'Category', 'CPU', 'Opening Qty', 'Opening Value', 'Stock In Qty', 'Stock In Value', 'Stock Out Qty', 'Stock Out Value', 'Closing Qty', 'Closing Value']];
  const body = rows.map((r, i) => [
    i + 1, r.sku.name, r.sku.category || '—', fmt(r.cpu),
    fmt(r.openingQty), fmt(Math.round(r.openingVal)),
    fmt(r.stockInQty), fmt(Math.round(r.stockInVal)),
    fmt(r.stockOutQty), fmt(Math.round(r.stockOutVal)),
    fmt(r.closingQty), fmt(Math.round(r.closingVal)),
  ]);

  autoTable(doc, {
    head, body, startY: 33,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2 },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    bodyStyles: { textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 }, 1: { cellWidth: 45 }, 2: { cellWidth: 25, halign: 'center' },
      3: { halign: 'right', cellWidth: 18 }, 4: { halign: 'right', cellWidth: 20 }, 5: { halign: 'right', cellWidth: 25 },
      6: { halign: 'right', cellWidth: 20 }, 7: { halign: 'right', cellWidth: 25 }, 8: { halign: 'right', cellWidth: 22 },
      9: { halign: 'right', cellWidth: 25 }, 10: { halign: 'right', cellWidth: 22 }, 11: { halign: 'right', cellWidth: 28 },
    },
  });
}

function addTotals(doc: jsPDF, rows: MonthEndRow[], totals: { totalOpening: { qty: number; val: number }; totalStockIn: { qty: number; val: number }; totalStockOut: { qty: number; val: number }; totalClosing: { qty: number; val: number } }) {
  const margin = 15;
  const { totalOpening, totalStockIn, totalStockOut, totalClosing } = totals;

  autoTable(doc, {
    body: [[
      '', 'TOTAL', '', '',
      fmt(totalOpening.qty), fmt(Math.round(totalOpening.val)),
      fmt(totalStockIn.qty), fmt(Math.round(totalStockIn.val)),
      fmt(totalStockOut.qty), fmt(Math.round(totalStockOut.val)),
      fmt(totalClosing.qty), fmt(Math.round(totalClosing.val)),
    ]],
    startY: (doc as any).lastAutoTable.finalY,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7, cellPadding: 2, fontStyle: 'bold', fillColor: [219, 234, 254], lineColor: [200, 200, 200], lineWidth: 0.2 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 }, 1: { cellWidth: 45 }, 2: { cellWidth: 25, halign: 'center' },
      3: { halign: 'right', cellWidth: 18 }, 4: { halign: 'right', cellWidth: 20 }, 5: { halign: 'right', cellWidth: 25 },
      6: { halign: 'right', cellWidth: 20 }, 7: { halign: 'right', cellWidth: 25 }, 8: { halign: 'right', cellWidth: 22 },
      9: { halign: 'right', cellWidth: 25 }, 10: { halign: 'right', cellWidth: 22 }, 11: { halign: 'right', cellWidth: 28 },
    },
  });
}

function addSignatures(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const finalY = (doc as any).lastAutoTable?.finalY || 150;
  const sigY = Math.max(finalY + 15, pageHeight - 60);
  const sigWidth = (pageWidth - 2 * margin) / 4 - 5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const sigLabels = ['Prepared by', 'Reviewed by', 'Approved by', 'Received by'];
  sigLabels.forEach((label, i) => {
    const x = margin + i * (sigWidth + 7);
    doc.text(label, x + sigWidth / 2, sigY, { align: 'center' });
    doc.setDrawColor(100, 100, 100);
    doc.line(x, sigY + 20, x + sigWidth, sigY + 20);
    doc.setFontSize(7);
    doc.text('(Name)', x + sigWidth / 2, sigY + 26, { align: 'center' });
    doc.line(x, sigY + 32, x + sigWidth / 2 - 5, sigY + 32);
    doc.text('(Date)', x + sigWidth / 2 + 2, sigY + 38, { align: 'left' });
    doc.line(x + sigWidth / 2 + 12, sigY + 32, x + sigWidth, sigY + 32);
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated on ${new Date().toLocaleString()}`, margin, pageHeight - 8);
  doc.text('Easy Gold Merch Management System', pageWidth - margin, pageHeight - 8, { align: 'right' });
}

export function exportMonthEndPdf(opts: PdfOptions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  addHeader(doc, opts);
  addTable(doc, opts.rows);
  addTotals(doc, opts.rows, {
    totalOpening: opts.totalOpening,
    totalStockIn: opts.totalStockIn,
    totalStockOut: opts.totalStockOut,
    totalClosing: opts.totalClosing,
  });
  addSignatures(doc);

  doc.save(`month-end-report-${opts.dateRange.replace(/\s/g, '-')}.pdf`);
}

export function printMonthEndPdf(opts: PdfOptions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  addHeader(doc, opts);
  addTable(doc, opts.rows);
  addTotals(doc, opts.rows, {
    totalOpening: opts.totalOpening,
    totalStockIn: opts.totalStockIn,
    totalStockOut: opts.totalStockOut,
    totalClosing: opts.totalClosing,
  });
  addSignatures(doc);

  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(pdfUrl, '_blank');
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print();
      printWindow.onafterprint = () => URL.revokeObjectURL(pdfUrl);
    };
  }
}
