import { NextRequest, NextResponse } from "next/server";
import { QA_SYSTEM, deepseekChat, extractJson, resolveApiKey, type TestCase } from "@/lib/qa";
import {
  buildCoverageFallback,
  buildReviewTcPrompt,
  type Requirement,
  type ReviewResult,
} from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { requirements, testcases, apiKey, model } = await req.json();
    const reqs = (requirements || []) as Requirement[];
    const tcs = (testcases || []) as TestCase[];
    if (!reqs.length || !tcs.length) {
      return NextResponse.json({ error: "Butuh requirement dan test case untuk di-review." }, { status: 400 });
    }
    const key = resolveApiKey(apiKey);
    let result: ReviewResult;
    if (key) {
      try {
        const raw = await deepseekChat({
          apiKey: key,
          model: model || "deepseek-chat",
          messages: [
            { role: "system", content: QA_SYSTEM },
            { role: "user", content: buildReviewTcPrompt(reqs, tcs) },
          ],
          jsonMode: true,
          temperature: 0.3,
        });
        const parsed = extractJson<{
          coverage?: { req_id: string; jumlah: number; tipe_tercakup: string[]; tipe_kurang: string[] }[];
          duplikat?: { tc_ids: string[]; alasan: string }[];
          tidak_tercakup?: string[];
          rekomendasi?: string;
        }>(raw);
        const judulOf = (id: string) => reqs.find((r) => r.id === id)?.judul || "";
        result = {
          coverage: (parsed.coverage || []).map((c) => ({
            req_id: c.req_id,
            judul: judulOf(c.req_id),
            jumlah: c.jumlah,
            tipe_tercakup: c.tipe_tercakup || [],
            tipe_kurang: c.tipe_kurang || [],
            tercakup: (c.tipe_kurang || []).length === 0,
          })),
          duplikat: parsed.duplikat || [],
          tidak_tercakup: parsed.tidak_tercakup || [],
          rekomendasi: parsed.rekomendasi || "-",
        };
      } catch {
        result = buildCoverageFallback(reqs, tcs);
      }
    } else {
      result = buildCoverageFallback(reqs, tcs);
    }
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal me-review test case." }, { status: 500 });
  }
}
