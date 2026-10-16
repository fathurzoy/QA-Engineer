// lib/qa.ts — Fondasi QAE-Bot: tipe data, klien DeepSeek, prompt QA.
// Semua teks yang dibaca manusia memakai Bahasa Indonesia.

export interface TestCase {
  id: string; // TC-001
  req_id: string; // REQ-001
  judul: string;
  tipe: string; // Positive | Negative | Boundary | Edge | Keamanan | Usabilitas | Kinerja
  precondition: string;
  steps: string[];
  expected_result: string;
  prioritas: string; // Tinggi | Sedang | Rendah
  oracle: string; // sumber kebenaran ekspektasi (kutipan PRD / standar)
}

export type Assertion =
  | { type: "status_eq"; value: number }
  | { type: "status_range"; min: number; max: number }
  | { type: "body_contains"; value: string }
  | { type: "body_json_has"; path: string }
  | { type: "body_json_eq"; path: string; value: unknown }
  | { type: "latency_lt_ms"; value: number };

export interface CheckRequestDef {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ApiCheck {
  id: string;
  judul: string;
  kategori: string;
  request: CheckRequestDef;
  assertions: Assertion[];
  oracle: string;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actual: string;
  message: string;
}

export interface CheckResult {
  id: string;
  judul: string;
  passed: boolean;
  latency_ms: number;
  http_status: number | null;
  error?: string;
  assertions: AssertionResult[];
  response_snippet: string;
}

export function resolveApiKey(provided?: string): string {
  return (provided || "").trim() || (process.env.DEEPSEEK_API_KEY || "").trim();
}

interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function deepseekChat(opts: {
  apiKey: string;
  model?: string;
  messages: ChatMsg[];
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<string> {
  const { apiKey, model = "deepseek-chat", messages, temperature = 0.3, jsonMode = false, maxTokens = 8000 } = opts;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`DeepSeek API error ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Respons DeepSeek kosong.");
  return content;
}

/** Ambil JSON dari respons model (tahan terhadap blok ```json dan teks pembuka). */
export function extractJson<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/```json\s*/gi, "```").trim();
  const fence = cleaned.match(/```\s*([\s\S]*?)```/);
  const candidate = (fence ? fence[1] : cleaned).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.search(/[{[]/);
    if (start >= 0) {
      for (let end = candidate.length; end > start; end--) {
        try {
          return JSON.parse(candidate.slice(start, end)) as T;
        } catch {
          /* coba potongan lebih pendek */
        }
      }
    }
    throw new Error("Gagal membaca JSON dari respons AI. Coba ulangi sekali lagi.");
  }
}

export const QA_SYSTEM = `Kamu adalah QAE-Bot, Senior QA Engineer dengan pengalaman 10+ tahun di pengujian manual dan otomasi (API, web, mobile). Kamu bekerja untuk tim berbahasa Indonesia. Semua output yang dibaca manusia WAJIB berbahasa Indonesia yang jelas dan profesional.

PRINSIP PENGUJIAN YANG WAJIB KAMU PATUHI:
1. ORACLE INDEPENDEN: setiap ekspektasi harus bisa dilacak ke PRD/spesifikasi atau standar umum (misalnya semantik HTTP), BUKAN ke implementasi kode. Dilarang keras menulis ekspektasi yang hanya mengulang apa yang dilakukan kode.
2. ANTI-TAUTOLOGI: dilarang test yang "pasti lolos", contohnya: meng-assert nilai yang baru saja di-set oleh test itu sendiri; meng-assert response body sama persis dengan request body tanpa verifikasi independen; meng-assert status 200 hanya karena "biasanya 200".
3. BERPIKIR ADVERSARIAL: untuk setiap fitur buat kasus negatif — input kosong, tipe data salah, melewati batas panjang, karakter spesial/injeksi (' OR '1'='1, <script>), data duplikat, dan otorisasi (tanpa token / token milik user lain).
4. BOUNDARY VALUE ANALYSIS: jika PRD menyebut batas (panjang, nilai, jumlah), uji tepat di min-1, min, max, max+1.
5. Setiap assertion API harus memverifikasi FAKTA dari server (status code, isi body, header, waktu respons) berdasarkan PRD/standar — bukan mengulang definisi test.
6. JUJUR SOAL KETIDAKPASTIAN: jika PRD tidak menyebut suatu perilaku, tulis ekspektasi sebagai "perlu konfirmasi ke product" dan beri rekomendasi, jangan mengarang seolah itu spesifikasi.`;

export function buildPlanPrompt(
  tugas: string,
  endpoint: { method: string; url: string; headers: Record<string, string>; body: string },
  testcases: TestCase[]
): string {
  const tcRingkas =
    testcases.length > 0
      ? testcases
          .slice(0, 40)
          .map((t) => `- ${t.id} [${t.req_id}/${t.tipe}/${t.prioritas}] ${t.judul} — ekspektasi: ${t.expected_result}`)
          .join("\n")
      : "(tidak ada test case; buat dari nol berdasarkan tugas)";
  return `Tugas pengujian: "${tugas}"
Endpoint: ${endpoint.method.toUpperCase()} ${endpoint.url}
Headers contoh: ${JSON.stringify(endpoint.headers)}
Body contoh: ${endpoint.body || "(kosong)"}

Test case yang relevan (boleh dipakai sebagai inspirasi, tapi JANGAN disalin mentah-mentah — setiap check harus menembak server betulan):
${tcRingkas}

Buatkan rencana eksekusi pengujian API. Output HANYA JSON object: {"checks": [ ... ]} tanpa teks lain.
Setiap check punya: "id" ("CHK-001", ...), "judul" (Bahasa Indonesia), "kategori", "request": {"method", "url", "headers" (object), "body" (string JSON atau string kosong)}, "assertions" (array), "oracle" (sumber ekspektasi).

Wajib mencakup minimal: (1) happy path, (2) kredensial/input salah, (3) body kosong atau field wajib hilang, (4) format tak valid, (5) minimal satu percobaan injeksi / input jahat, (6) tanpa header otorisasi bila endpoint tampak butuh auth.

Jenis assertion yang tersedia (pilih yang tepat):
- {"type":"status_eq","value":200}
- {"type":"status_range","min":200,"max":299}
- {"type":"body_contains","value":"token"}
- {"type":"body_json_has","path":"data.token"}
- {"type":"body_json_eq","path":"success","value":true}
- {"type":"latency_lt_ms","value":3000}

Aturan assertion: verifikasi FAKTA dari server berdasarkan standar/PRD. Dilarang assertion tautologis (mis. body_json_eq yang membandingkan dengan nilai yang baru dikirim tanpa makna bisnis). Untuk kasus negatif, assertion yang benar biasanya status_range 400-499 + body_contains pesan error, BUKAN status 200.`;
}

export function buildReportPrompt(ringkasan: string): string {
  return `Kamu baru saja mengeksekusi pengujian API. Berikut ringkasan mentahnya:

${ringkasan}

Tulis LAPORAN QA dalam Bahasa Indonesia (format Markdown) dengan struktur:
## Ringkasan Eksekutif
(satu-dua kalimat: berapa check, berapa lolos/gagal, penilaian umum)
## Temuan Penting
(daftar temuan yang gagal / berisiko, tiap temuan: apa yang terjadi, mengapa itu masalah, tingkat keparahan)
## Rekomendasi
(langkah perbaikan konkret untuk developer, diurutkan dari paling penting)

Gaya: profesional, lugas, tanpa basa-basi. Jangan mengarang temuan yang tidak ada di data. Jika semua lolos, tetap beri 1-2 rekomendasi penguatan (mis. rate limiting, validasi tambahan).`;
}

export function assertionLabel(a: Assertion): string {
  switch (a.type) {
    case "status_eq":
      return `status == ${a.value}`;
    case "status_range":
      return `status ${a.min}–${a.max}`;
    case "body_contains":
      return `body mengandung "${a.value}"`;
    case "body_json_has":
      return `body punya path "${a.path}"`;
    case "body_json_eq":
      return `"${a.path}" == ${JSON.stringify(a.value)}`;
    case "latency_lt_ms":
      return `latensi < ${a.value} ms`;
  }
}
