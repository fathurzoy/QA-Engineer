// lib/pipeline.ts — Pipeline PRD → Requirement → Review 3 persona → Test Case → Review coverage.
// Mengikuti alur: Parser/Extractor → PRD Review (paralel, 3 persona) → Merge/klarifikasi
// → Test Case Generator (per requirement) → Test Case Reviewer.

import { QA_SYSTEM, deepseekChat, extractJson, type TestCase } from "./qa";

export interface Requirement {
  id: string; // REQ-001
  judul: string;
  deskripsi: string;
  acceptance_criteria: string;
}

export interface ReviewFinding {
  req_id: string;
  requirement: string;
  masalah: string;
  severity: string; // Kritis | Tinggi | Sedang | Rendah
  pertanyaan: string;
  persona: string; // QA | Engineer | Product
}

export interface CoverageRow {
  req_id: string;
  judul: string;
  jumlah: number;
  tipe_tercakup: string[];
  tipe_kurang: string[];
  tercakup: boolean;
}

export interface ReviewResult {
  coverage: CoverageRow[];
  duplikat: { tc_ids: string[]; alasan: string }[];
  tidak_tercakup: string[];
  rekomendasi: string;
}

// ---------- 1. Parser / Extractor ----------

export function buildExtractPrompt(prd: string): string {
  return `Dari PRD berikut, ekstrak SEMUA requirement yang bisa diuji (fungsional maupun non-fungsional).

<PRD>
${prd}
</PRD>

Aturan:
- Output HANYA JSON object: {"requirements": [ ... ]} tanpa teks lain.
- Satu requirement = satu perilaku yang bisa diuji. Jangan menggabungkan dua perilaku berbeda dalam satu requirement.
- Setiap requirement: "id" ("REQ-001", "REQ-002", ... berurutan), "judul" (ringkas, Bahasa Indonesia), "deskripsi" (1-2 kalimat), "acceptance_criteria" (kriteria penerimaan; jika tidak disebut di PRD tulis persis "Tidak disebut di PRD").
- Jangan membuat asumsi sendiri. Jangan menambahkan requirement yang tidak ada di PRD.`;
}

// ---------- 2. PRD Review — 3 persona (dijalankan paralel) ----------

const REVIEW_OUTPUT = `Output HANYA JSON object: {"temuan": [ ... ]} tanpa teks lain.
Setiap temuan: "req_id" (REQ-ID yang bermasalah, atau "UMUM" bila menyangkut keseluruhan PRD), "requirement" (judul requirement), "masalah" (jelas & spesifik), "severity" (Kritis/Tinggi/Sedang/Rendah), "pertanyaan" (pertanyaan klarifikasi konkret untuk product owner; bila tidak ada yang perlu ditanya tulis "-").`;

export const PERSONA_PROMPTS: { persona: string; system: string; user: (reqs: Requirement[]) => string }[] = [
  {
    persona: "QA",
    system:
      QA_SYSTEM +
      `\n\nKamu sedang berperan sebagai QA ENGINEER dalam review PRD. Fokusmu: TESTABILITY.`,
    user: (reqs) => `Review daftar requirement berikut dari sudut pandang QA Engineer senior. Cari: requirement yang ambigu (bisa ditafsir lebih dari satu cara), tidak testable (tidak ada cara objektif memverifikasi), acceptance criteria hilang/tidak terukur, konflik antar requirement, dan edge case yang tidak dibahas PRD.

${reqs.map((r) => `- ${r.id} ${r.judul}: ${r.deskripsi} | AC: ${r.acceptance_criteria}`).join("\n")}

${REVIEW_OUTPUT}
Jangan membuat asumsi sendiri — kalau info kurang, tuangkan sebagai pertanyaan klarifikasi.`,
  },
  {
    persona: "Engineer",
    system:
      QA_SYSTEM +
      `\n\nKamu sedang berperan sebagai SOFTWARE ENGINEER senior dalam review PRD. Fokusmu: FEASIBILITY & EDGE CASE TEKNIS.`,
    user: (reqs) => `Review daftar requirement berikut dari sudut pandang Software Engineer senior. Cari: requirement yang sulit/tidak feasible diimplementasikan, edge case teknis yang tidak dibahas (konkurensi, idempotency, format data, timezone, paginasi, limit, retry, error handling), dependensi antar requirement yang tidak jelas, dan konflik teknis antar requirement.

${reqs.map((r) => `- ${r.id} ${r.judul}: ${r.deskripsi} | AC: ${r.acceptance_criteria}`).join("\n")}

${REVIEW_OUTPUT}
Jangan membuat asumsi sendiri — kalau info kurang, tuangkan sebagai pertanyaan klarifikasi.`,
  },
  {
    persona: "Product",
    system:
      QA_SYSTEM +
      `\n\nKamu sedang berperan sebagai PRODUCT MANAGER / Business Analyst dalam review PRD. Fokusmu: KONSISTENSI & ACCEPTANCE CRITERIA.`,
    user: (reqs) => `Review daftar requirement berikut dari sudut pandang Product Manager/BA. Cari: inkonsistensi dengan tujuan produk, ruang lingkup yang tidak jelas (in/out of scope), requirement yang kehilangan "definisi selesai", prioritas yang janggal, dan persona/user yang tidak disebutkan padahal terdampak.

${reqs.map((r) => `- ${r.id} ${r.judul}: ${r.deskripsi} | AC: ${r.acceptance_criteria}`).join("\n")}

${REVIEW_OUTPUT}
Jangan membuat asumsi sendiri — kalau info kurang, tuangkan sebagai pertanyaan klarifikasi.`,
  },
];

export async function runPersonaReviews(
  apiKey: string,
  model: string,
  requirements: Requirement[]
): Promise<ReviewFinding[]> {
  const results = await Promise.all(
    PERSONA_PROMPTS.map(async (p) => {
      const raw = await deepseekChat({
        apiKey,
        model,
        messages: [
          { role: "system", content: p.system },
          { role: "user", content: p.user(requirements) },
        ],
        jsonMode: true,
        temperature: 0.4,
      });
      const parsed = extractJson<{ temuan?: Omit<ReviewFinding, "persona">[] }>(raw);
      return (parsed.temuan || []).map((t) => ({ ...t, persona: p.persona }));
    })
  );
  return results.flat();
}

// ---------- 4. Test Case Generator (per requirement) ----------

export function buildGenerateTcPrompt(requirements: Requirement[], klarifikasi: string): string {
  return `Berdasarkan requirement yang sudah diklarifikasi berikut, buat test case.

<REQUIREMENTS>
${JSON.stringify(requirements, null, 2)}
</REQUIREMENTS>

<KLAARIFIKASI DARI PRODUCT OWNER>
${klarifikasi || "(belum ada klarifikasi — tandai asumsi sebagai 'Perlu konfirmasi')"}
</KLARIFIKASI DARI PRODUCT OWNER>

Aturan keras:
- Setiap requirement WAJIB punya minimal: 1 Positive, 1 Negative, 1 Boundary/Edge.
- Setiap test case WAJIB mencantumkan REQ-ID yang tepat.
- Jangan membuat asumsi sendiri: bila info kurang, tulis expected_result diawali "Perlu konfirmasi: ..." dan tetap buat test case-nya.
- Terapkan prinsip anti-tautologi: setiap expected_result wajib punya oracle independen (kutipan PRD/AC/standar), bukan mengulang implementasi.
- Output HANYA JSON object: {"testcases": [ ... ]} tanpa teks lain.
- Setiap test case: "id" ("TC-001", ... berurutan), "req_id", "judul" (Bahasa Indonesia, ringkas), "tipe" (Positive/Negative/Boundary/Edge), "precondition", "steps" (array string), "expected_result" (spesifik & terukur), "prioritas" (Tinggi/Sedang/Rendah), "oracle".
- Jangan ada dua test case yang menguji hal identik.`;
}

export function normalizeTestCases(raw: unknown): TestCase[] {
  const parsed = raw as { testcases?: Record<string, unknown>[] } | Record<string, unknown>[];
  const list = Array.isArray(parsed) ? parsed : parsed.testcases || [];
  return list.map((t, i) => ({
    id: String(t.id || `TC-${String(i + 1).padStart(3, "0")}`),
    req_id: String(t.req_id || t["REQ-ID"] || "REQ-?"),
    judul: String(t.judul || t["Judul"] || `Test case ${i + 1}`),
    tipe: String(t.tipe || t["Tipe"] || "Positive"),
    precondition: String(t.precondition || t["Precondition"] || "-"),
    steps: Array.isArray(t.steps)
      ? t.steps.map(String)
      : String(t.steps || t["Steps"] || "-")
          .split(/\n|;\s*/)
          .map((s) => s.trim())
          .filter(Boolean),
    expected_result: String(t.expected_result || t["Expected Result"] || "-"),
    prioritas: String(t.prioritas || t["Prioritas"] || "Sedang"),
    oracle: String(t.oracle || "-"),
  }));
}

// ---------- 5. Test Case Reviewer ----------

export function buildReviewTcPrompt(requirements: Requirement[], testcases: TestCase[]): string {
  return `Lakukan REVIEW atas test case berikut terhadap daftar requirement.

<REQUIREMENTS>
${requirements.map((r) => `${r.id} ${r.judul}: ${r.deskripsi}`).join("\n")}
</REQUIREMENTS>

<TEST CASES>
${testcases.map((t) => `${t.id} | ${t.req_id} | ${t.tipe} | ${t.judul} | ekspektasi: ${t.expected_result}`).join("\n")}
</TEST CASES>

Periksa: (1) coverage — tiap REQ-ID tercakup minimal Positive+Negative+Boundary/Edge? (2) duplikat — test case yang menguji hal sama? (3) traceability — tiap test case menunjuk REQ-ID yang valid?

Output HANYA JSON object tanpa teks lain:
{"coverage": [{"req_id": "REQ-001", "jumlah": 3, "tipe_tercakup": ["Positive","Negative"], "tipe_kurang": ["Boundary/Edge"]}], "duplikat": [{"tc_ids": ["TC-002","TC-005"], "alasan": "..."}], "tidak_tercakup": ["REQ-004"], "rekomendasi": "ringkasan perbaikan dalam Bahasa Indonesia"}`;
}

export function buildCoverageFallback(requirements: Requirement[], testcases: TestCase[]): ReviewResult {
  const byReq = new Map<string, TestCase[]>();
  for (const t of testcases) {
    const arr = byReq.get(t.req_id) || [];
    arr.push(t);
    byReq.set(t.req_id, arr);
  }
  const coverage: CoverageRow[] = requirements.map((r) => {
    const list = byReq.get(r.id) || [];
    const tipe = [...new Set(list.map((t) => t.tipe))];
    const wajib = ["Positive", "Negative", "Boundary", "Edge"];
    const kurang = wajib.filter((w) => !tipe.some((t) => t.toLowerCase().includes(w.toLowerCase())));
    return {
      req_id: r.id,
      judul: r.judul,
      jumlah: list.length,
      tipe_tercakup: tipe,
      tipe_kurang: kurang,
      tercakup: kurang.length === 0,
    };
  });
  return {
    coverage,
    duplikat: [],
    tidak_tercakup: coverage.filter((c) => c.jumlah === 0).map((c) => c.req_id),
    rekomendasi: "Review AI tidak tersedia; ini hasil hitung coverage otomatis.",
  };
}
