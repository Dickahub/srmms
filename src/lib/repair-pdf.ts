import jsPDF from "jspdf";
import type { RepairLog } from "@/hooks/use-repair-logs";
import type { RepairPart } from "@/hooks/use-repair-parts";
import type { Delivery } from "@/hooks/use-deliveries";
import { formatCurrency } from "@/lib/format-currency";

export type RepairPdfInput = {
  order_number: string;
  title: string;
  created_at: string;
  completed_at: string | null;
  description: string | null;
  diagnosis: string | null;
  resolution: string | null;
  cost: number | null;
  machine: { brand: string | null; model: string | null; machine_type: string | null; serial_number: string | null } | null;
  client: { name: string; phone: string | null } | null;
  technicianName: string | null;
  logs: RepairLog[];
  parts: RepairPart[];
  /** Only present once the repair has actually been delivered — the block is omitted otherwise. */
  delivery: Delivery | null;
};

const MARGIN = 15;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB");
}

export function generateRepairPdf(data: RepairPdfInput): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  function ensureSpace(height: number) {
    if (y + height > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function sectionTitle(text: string) {
    ensureSpace(12);
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
    ensureSpace(6);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, MARGIN, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "normal");
    doc.text(value || "—", MARGIN + labelWidth, y);
    y += 6;
  }

  function paragraph(text: string) {
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    ensureSpace(lines.length * 5 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 2;
  }

  function table(headers: string[], widthRatios: number[], rows: string[][]) {
    const widths = widthRatios.map((r) => r * CONTENT_WIDTH);

    ensureSpace(7);
    doc.setFont("helvetica", "bold");
    let x = MARGIN;
    headers.forEach((h, i) => {
      doc.text(h, x + 1, y);
      x += widths[i];
    });
    y += 2;
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");

    for (const row of rows) {
      const cellLines = row.map((cell, i) => doc.splitTextToSize(cell, widths[i] - 2) as string[]);
      const lineCount = Math.max(...cellLines.map((c) => c.length), 1);
      ensureSpace(lineCount * 5 + 2);
      x = MARGIN;
      cellLines.forEach((lines, i) => {
        doc.text(lines, x + 1, y);
        x += widths[i];
      });
      y += lineCount * 5 + 2;
    }
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("REPAIR SHEET", PAGE_WIDTH / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(11);
  doc.text(data.title, PAGE_WIDTH / 2, y, { align: "center" });
  y += 10;
  doc.setFontSize(10);

  labelValue("Order number", data.order_number);
  labelValue("Start date", formatDate(data.created_at));
  labelValue("End date", data.completed_at ? formatDate(data.completed_at) : "—");
  labelValue("Cost", data.cost != null ? formatCurrency(data.cost) : "—");
  y += 2;

  sectionTitle("EQUIPMENT");
  const designation = [data.machine?.machine_type, data.machine?.brand, data.machine?.model].filter(Boolean).join(" ");
  labelValue("Equipment designation", designation || "—");
  labelValue("Serial number", data.machine?.serial_number || "—");
  y += 2;

  sectionTitle("CLIENT");
  labelValue("Client name", data.client?.name || "—");
  labelValue("Phone", data.client?.phone || "—");
  y += 2;

  sectionTitle("TECHNICIAN");
  labelValue("Name", data.technicianName || "Unassigned");
  y += 2;

  sectionTitle("CONDITION ON ARRIVAL — OBSERVATIONS");
  paragraph(data.description || "No observations.");
  y += 2;

  sectionTitle("DIAGNOSIS");
  paragraph(data.diagnosis || "No diagnosis recorded.");
  y += 2;

  sectionTitle("RESOLUTION");
  paragraph(data.resolution || "No resolution recorded.");
  y += 2;

  sectionTitle("ACTIONS TAKEN");
  if (data.logs.length === 0) {
    paragraph("No actions recorded.");
  } else {
    table(
      ["Action", "Result", "Technician", "Date"],
      [0.35, 0.3, 0.2, 0.15],
      data.logs.map((l) => [l.action, l.result || "—", l.technician?.name || "—", formatDate(l.created_at)]),
    );
  }
  y += 2;

  sectionTitle("PARTS USED");
  if (data.parts.length === 0) {
    paragraph("No parts used.");
  } else {
    table(
      ["Part", "Quantity"],
      [0.7, 0.3],
      data.parts.map((p) => [p.part?.name || "—", `${p.quantity} ${p.part?.unit ?? ""}`.trim()]),
    );
  }

  if (data.delivery) {
    y += 2;
    sectionTitle("DELIVERY");
    labelValue("Delivered to", data.delivery.picked_up_by_name);
    labelValue("Phone", data.delivery.picked_up_by_phone || "—");
    labelValue("Delivery date", formatDate(data.delivery.delivered_at));
    if (data.delivery.notes) paragraph(data.delivery.notes);
  }

  const now = new Date();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Generated on ${now.toLocaleDateString("en-GB")} at ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
    MARGIN,
    PAGE_HEIGHT - 10,
  );

  doc.save(`repair-sheet-${data.order_number}.pdf`);
}
