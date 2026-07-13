import jsPDF from "jspdf";

export type StockEntryPdfInput = {
  entry_number: string;
  created_at: string;
  part_name: string;
  part_sku: string;
  unit: string;
  quantity: number;
  resulting_quantity_on_hand: number;
  entered_by_name: string;
  kept_by_name: string | null;
  supplier: string | null;
  notes: string | null;
};

const MARGIN = 15;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}

// Same jsPDF pattern and visual style as generateRepairPdf (src/lib/repair-pdf.ts)
// — a plain, printable voucher rather than a second bespoke layout.
export function generateStockEntryPdf(data: StockEntryPdfInput): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  function sectionTitle(text: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(text, MARGIN, y);
    y += 2;
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  }

  function labelValue(label: string, value: string) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, MARGIN, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "normal");
    doc.text(value || "—", MARGIN + labelWidth, y);
    y += 6;
  }

  function paragraph(text: string) {
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 2;
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("SECEL", PAGE_WIDTH / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(16);
  doc.text("STOCK ENTRY VOUCHER", PAGE_WIDTH / 2, y, { align: "center" });
  y += 10;
  doc.setFontSize(10);

  labelValue("Entry number", data.entry_number);
  labelValue("Date", formatDate(data.created_at));
  y += 2;

  sectionTitle("PART");
  labelValue("Part", `${data.part_name} (${data.part_sku})`);
  labelValue("Quantity entered", `${data.quantity} ${data.unit}`);
  labelValue("New stock level", `${data.resulting_quantity_on_hand} ${data.unit}`);
  y += 2;

  sectionTitle("ENTRY DETAILS");
  labelValue("Entered by", data.entered_by_name);
  labelValue("Kept by", data.kept_by_name || "—");
  labelValue("Supplier", data.supplier || "—");
  y += 2;

  if (data.notes) {
    sectionTitle("NOTES");
    paragraph(data.notes);
    y += 2;
  }

  y += 12;
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, MARGIN + 70, y);
  y += 4;
  doc.setFontSize(8);
  doc.text("Signature", MARGIN, y);

  const now = new Date();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Generated on ${now.toLocaleDateString("en-GB")} at ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
    MARGIN,
    280,
  );

  doc.save(`stock-entry-${data.entry_number}.pdf`);
}
