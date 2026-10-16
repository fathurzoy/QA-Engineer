import { NextRequest, NextResponse } from "next/server";
import { QA_SYSTEM, buildReportPrompt, deepseekChat, resolveApiKey, type CheckResult } from "@/lib/qa";

export async function POST(req: NextRequest) {
  try {
    const { results, apiKey, model } = await req.json();
    const list = (results || []) as CheckResult[];
    if (!list.length) {
      return NextResponse.json({ error: "Belum ada hasil pengujian untuk dilaporkan." }, { status: 400 });
    }
    const total = list.length;
    const passed = list.filter((r) => r.passed).length;
    const failed = total - passed;
    const rate = Math.round((passed / total) * 100);

    const baris = list
      .map((r) => {
        const status = r.passed ? "LOLOS" : "GAGAL";
        const detail = r.error
          ? `ERROR: ${r.error}`
          : r.assertions.map((a) => `  - [${a.passed ? "OK" : "X"}] ${a.message} (aktual: ${a.actual})`).join("\n");
        return `* ${r.id} ${r.judul} — ${status} (HTTP ${r.http_status ?? "-"}, ${r.latency_ms} ms)\n${detail}`;
      })
      .join("\n");

    const ringkasan = `Total check: ${total}, lolos: ${passed}, gagal: ${failed}, pass rate: ${rate}%.\n\n${baris}`;

    let analisis = "";
    const key = resolveApiKey(apiKey);
    if (key) {
      try {
        analisis = await deepseekChat({
          apiKey: key,
          model: model || "deepseek-chat",
          messages: [
            { role: "system", content: QA_SYSTEM },
            { role: "user", content: buildReportPrompt(ringkasan) },
          ],
          temperature: 0.4,
        });
      } catch (e: unknown) {
        analisis = `_Analisis AI gagal dibuat (${e instanceof Error ? e.message : "error"}). Laporan mentah di bawah tetap valid._`;
      }
    } else {
      analisis = "_API key DeepSeek belum diisi, jadi analisis AI dilewati. Isi API key lalu buat ulang laporan untuk analisis otomatis._";
    }

    const markdown =
      `# Laporan Pengujian QAE-Bot\n\n` +
      `**Tanggal:** ${new Date().toLocaleString("id-ID")}\n\n` +
      `**Hasil:** ${passed}/${total} lolos (${rate}%)\n\n` +
      `${analisis}\n\n---\n\n## Detail Mentah\n\n${baris}\n`;

    return NextResponse.json({ total, passed, failed, rate, markdown });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal membuat laporan." }, { status: 500 });
  }
}
