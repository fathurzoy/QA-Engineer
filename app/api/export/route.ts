import { NextRequest, NextResponse } from "next/server";
import type { CheckResult, TestCase } from "@/lib/qa";

function cell(text: string, bold = false) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TableCell, Paragraph, TextRun, WidthType } = require("docx");
  return new TableCell({
    width: { size: 100, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ""), bold })] })],
  });
}

function csvEsc(v: unknown): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export async function POST(req: NextRequest) {
  try {
    const { format, testcases = [], results = [], report = "" } = await req.json();
    const tcs = testcases as TestCase[];
    const res = results as CheckResult[];

    // ---------- CSV (format contoh user: TC-ID,REQ-ID,Judul,Tipe,Precondition,Steps,Expected Result,Prioritas) ----------
    if (format === "csv") {
      const header = ["TC-ID", "REQ-ID", "Judul", "Tipe", "Precondition", "Steps", "Expected Result", "Prioritas"];
      const lines = [header.map(csvEsc).join(",")];
      for (const t of tcs) {
        lines.push(
          [
            t.id,
            t.req_id,
            t.judul,
            t.tipe,
            t.precondition,
            (t.steps || []).map((s, i) => `${i + 1}. ${s}`).join(" | "),
            t.expected_result,
            t.prioritas,
          ]
            .map(csvEsc)
            .join(",")
        );
      }
      const csv = "﻿" + lines.join("\r\n"); // BOM agar Excel baca UTF-8
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="qae-testcases.csv"',
        },
      });
    }

    if (format === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "QAE-Bot";

      const ws1 = wb.addWorksheet("Test Cases");
      ws1.columns = [
        { header: "TC-ID", key: "id", width: 10 },
        { header: "REQ-ID", key: "req_id", width: 10 },
        { header: "Judul", key: "judul", width: 42 },
        { header: "Tipe", key: "tipe", width: 14 },
        { header: "Prioritas", key: "prioritas", width: 12 },
        { header: "Precondition", key: "precondition", width: 30 },
        { header: "Steps", key: "steps", width: 55 },
        { header: "Expected Result", key: "expected_result", width: 48 },
        { header: "Oracle", key: "oracle", width: 36 },
      ];
      for (const t of tcs) {
        ws1.addRow({
          ...t,
          steps: (t.steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n"),
        });
      }
      ws1.getRow(1).font = { bold: true };

      if (res.length) {
        const ws2 = wb.addWorksheet("Hasil Eksekusi");
        ws2.columns = [
          { header: "ID", key: "id", width: 10 },
          { header: "Judul", key: "judul", width: 42 },
          { header: "Hasil", key: "hasil", width: 12 },
          { header: "HTTP", key: "http", width: 10 },
          { header: "Latensi (ms)", key: "lat", width: 14 },
          { header: "Detail Assertion", key: "detail", width: 70 },
        ];
        for (const r of res) {
          ws2.addRow({
            id: r.id,
            judul: r.judul,
            hasil: r.passed ? "LOLOS" : "GAGAL",
            http: r.http_status ?? "-",
            lat: r.latency_ms,
            detail: r.error || r.assertions.map((a) => `${a.passed ? "[OK]" : "[X]"} ${a.message} (aktual: ${a.actual})`).join("\n"),
          });
        }
        ws2.getRow(1).font = { bold: true };
      }

      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="qae-testcases.xlsx"',
        },
      });
    }

    if (format === "docx") {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow } = await import("docx");
      const children: unknown[] = [];
      const P = (t: string, bold = false) => new Paragraph({ children: [new TextRun({ text: t, bold })] });

      children.push(new Paragraph({ text: "Laporan QA — QAE-Bot", heading: HeadingLevel.TITLE }));
      children.push(P(`Tanggal: ${new Date().toLocaleString("id-ID")}`));
      children.push(new Paragraph({ text: "" }));

      if (tcs.length) {
        children.push(new Paragraph({ text: "Test Cases", heading: HeadingLevel.HEADING_1 }));
        for (const t of tcs) {
          children.push(new Paragraph({ text: `${t.id} — ${t.judul}`, heading: HeadingLevel.HEADING_2 }));
          children.push(
            new Table({
              rows: [
                new TableRow({ children: [cell("Field", true), cell("Isi", true)] }),
                ...(
                  [
                    ["REQ-ID", t.req_id],
                    ["Tipe", t.tipe],
                    ["Prioritas", t.prioritas],
                    ["Precondition", t.precondition],
                    ["Steps", (t.steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n")],
                    ["Expected Result", t.expected_result],
                    ["Oracle", t.oracle],
                  ] as [string, string][]
                ).map(([k, v]) => new TableRow({ children: [cell(k, true), cell(v)] })),
              ],
            })
          );
          children.push(new Paragraph({ text: "" }));
        }
      }

      if (res.length) {
        children.push(new Paragraph({ text: "Hasil Eksekusi", heading: HeadingLevel.HEADING_1 }));
        for (const r of res) {
          children.push(
            new Paragraph({
              text: `${r.id} — ${r.judul} : ${r.passed ? "LOLOS" : "GAGAL"} (HTTP ${r.http_status ?? "-"}, ${r.latency_ms} ms)`,
              heading: HeadingLevel.HEADING_2,
            })
          );
          if (r.error) children.push(P(`Error: ${r.error}`));
          for (const a of r.assertions) children.push(P(`${a.passed ? "[OK]" : "[X]"} ${a.message} (aktual: ${a.actual})`));
          children.push(new Paragraph({ text: "" }));
        }
      }

      if (report) {
        children.push(new Paragraph({ text: "Analisis", heading: HeadingLevel.HEADING_1 }));
        for (const line of String(report).split("\n")) children.push(P(line));
      }

      const doc = new Document({ sections: [{ children: children as never[] }] });
      const buf = Buffer.from(await Packer.toBuffer(doc));
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": 'attachment; filename="qae-laporan.docx"',
        },
      });
    }

    return NextResponse.json({ error: "Format harus 'csv', 'xlsx', atau 'docx'." }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal export dokumen." }, { status: 500 });
  }
}
