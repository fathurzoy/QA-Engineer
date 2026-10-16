import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/qa";
import { runPersonaReviews, type Requirement } from "@/lib/pipeline";

/** Review PRD oleh 3 persona (QA, Engineer, Product) yang berjalan PARALEL. */
export async function POST(req: NextRequest) {
  try {
    const { requirements, apiKey, model } = await req.json();
    const reqs = (requirements || []) as Requirement[];
    if (!reqs.length) {
      return NextResponse.json({ error: "Belum ada requirement untuk di-review." }, { status: 400 });
    }
    const key = resolveApiKey(apiKey);
    if (!key) {
      return NextResponse.json(
        { error: "API key DeepSeek belum diisi. Isi di bilah atas halaman, atau set DEEPSEEK_API_KEY di server." },
        { status: 400 }
      );
    }
    const temuan = await runPersonaReviews(key, model || "deepseek-chat", reqs);
    // Daftar pertanyaan klarifikasi unik untuk human check
    const pertanyaan = temuan.filter((t) => t.pertanyaan && t.pertanyaan.trim() !== "-");
    return NextResponse.json({ temuan, pertanyaan });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal me-review PRD." }, { status: 500 });
  }
}
