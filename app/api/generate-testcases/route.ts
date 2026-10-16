import { NextRequest, NextResponse } from "next/server";
import { QA_SYSTEM, deepseekChat, extractJson, resolveApiKey } from "@/lib/qa";
import {
  buildGenerateTcPrompt,
  normalizeTestCases,
  type Requirement,
} from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { requirements, klarifikasi = "", apiKey, model } = await req.json();
    const reqs = (requirements || []) as Requirement[];
    if (!reqs.length) {
      return NextResponse.json({ error: "Belum ada requirement. Ekstrak dulu dari PRD." }, { status: 400 });
    }
    const key = resolveApiKey(apiKey);
    if (!key) {
      return NextResponse.json(
        { error: "API key DeepSeek belum diisi. Isi di bilah atas halaman, atau set DEEPSEEK_API_KEY di server." },
        { status: 400 }
      );
    }
    const raw = await deepseekChat({
      apiKey: key,
      model: model || "deepseek-chat",
      messages: [
        { role: "system", content: QA_SYSTEM },
        { role: "user", content: buildGenerateTcPrompt(reqs, String(klarifikasi)) },
      ],
      jsonMode: true,
      temperature: 0.4,
      maxTokens: 12000,
    });
    const parsed = extractJson(raw);
    const testcases = normalizeTestCases(parsed);
    if (!testcases.length) throw new Error("AI tidak mengembalikan test case. Coba ulangi.");
    return NextResponse.json({ testcases });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal generate test case." }, { status: 500 });
  }
}
