import { NextRequest, NextResponse } from "next/server";
import {
  QA_SYSTEM,
  buildPlanPrompt,
  deepseekChat,
  extractJson,
  resolveApiKey,
  type ApiCheck,
  type TestCase,
} from "@/lib/qa";

export async function POST(req: NextRequest) {
  try {
    const { tugas, endpoint, testcases = [], apiKey, model } = await req.json();
    if (!tugas || !String(tugas).trim()) {
      return NextResponse.json({ error: "Tulis dulu tugasnya, mis. 'cek login'." }, { status: 400 });
    }
    if (!endpoint?.url || !String(endpoint.url).trim()) {
      return NextResponse.json({ error: "URL endpoint belum diisi." }, { status: 400 });
    }
    const key = resolveApiKey(apiKey);
    if (!key) {
      return NextResponse.json(
        { error: "API key DeepSeek belum diisi. Isi di bilah atas halaman, atau set DEEPSEEK_API_KEY di server." },
        { status: 400 }
      );
    }
    let headers: Record<string, string> = {};
    try {
      headers = typeof endpoint.headers === "string" ? JSON.parse(endpoint.headers || "{}") : endpoint.headers || {};
    } catch {
      return NextResponse.json({ error: "Headers bukan JSON yang valid." }, { status: 400 });
    }
    const raw = await deepseekChat({
      apiKey: key,
      model: model || "deepseek-chat",
      messages: [
        { role: "system", content: QA_SYSTEM },
        {
          role: "user",
          content: buildPlanPrompt(
            String(tugas),
            {
              method: String(endpoint.method || "POST"),
              url: String(endpoint.url),
              headers,
              body: String(endpoint.body || ""),
            },
            testcases as TestCase[]
          ),
        },
      ],
      jsonMode: true,
      temperature: 0.4,
    });
    const parsed = extractJson<{ checks?: ApiCheck[] } | ApiCheck[]>(raw);
    const checks = Array.isArray(parsed) ? parsed : parsed.checks || [];
    if (!checks.length) throw new Error("AI tidak mengembalikan rencana uji. Coba ulangi.");
    const norm: ApiCheck[] = checks.map((c, i) => ({
      id: c.id || `CHK-${String(i + 1).padStart(3, "0")}`,
      judul: c.judul || `Check ${i + 1}`,
      kategori: c.kategori || "Fungsional",
      request: {
        method: String(c.request?.method || endpoint.method || "POST").toUpperCase(),
        url: c.request?.url || String(endpoint.url),
        headers: c.request?.headers || headers,
        body: typeof c.request?.body === "string" ? c.request.body : JSON.stringify(c.request?.body ?? ""),
      },
      assertions: Array.isArray(c.assertions) ? c.assertions : [],
      oracle: c.oracle || "-",
    }));
    return NextResponse.json({ checks: norm });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal membuat rencana uji." }, { status: 500 });
  }
}
