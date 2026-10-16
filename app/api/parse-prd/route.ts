import { NextRequest, NextResponse } from "next/server";
import { deepseekChat, extractJson, resolveApiKey } from "@/lib/qa";
import { buildExtractPrompt, type Requirement } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { prd, apiKey, model } = await req.json();
    if (!prd || !String(prd).trim()) {
      return NextResponse.json({ error: "PRD masih kosong. Tempel teks PRD dulu ya." }, { status: 400 });
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
      messages: [{ role: "user", content: buildExtractPrompt(String(prd)) }],
      jsonMode: true,
      temperature: 0.3,
    });
    const parsed = extractJson<{ requirements?: Requirement[] } | Requirement[]>(raw);
    const requirements = Array.isArray(parsed) ? parsed : parsed.requirements || [];
    if (!requirements.length) throw new Error("AI tidak menemukan requirement di PRD ini. Coba perjelas teks PRD.");
    const norm: Requirement[] = requirements.map((r, i) => ({
      id: r.id || `REQ-${String(i + 1).padStart(3, "0")}`,
      judul: r.judul || `Requirement ${i + 1}`,
      deskripsi: r.deskripsi || "-",
      acceptance_criteria: r.acceptance_criteria || "Tidak disebut di PRD",
    }));
    return NextResponse.json({ requirements: norm });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal mengekstrak requirement." }, { status: 500 });
  }
}
