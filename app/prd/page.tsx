"use client";
import { useEffect, useState } from "react";
import ApiKeyBar, { getApiKey, getModel } from "@/components/ApiKeyBar";
import type { Requirement, ReviewFinding, ReviewResult } from "@/lib/pipeline";
import type { TestCase } from "@/lib/qa";

const LS = {
  prd: "qae_prd",
  reqs: "qae_requirements",
  temuan: "qae_temuan",
  klarifikasi: "qae_klarifikasi",
  tcs: "qae_testcases",
  review: "qae_review",
};

function load<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(k: string, v: unknown) {
  localStorage.setItem(k, JSON.stringify(v));
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportFile(format: "csv" | "xlsx" | "docx", testcases: TestCase[]) {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, testcases }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Gagal export.");
  }
  const blob = await res.blob();
  downloadBlob(blob, `qae-testcases.${format}`);
}

function sevBadge(s: string) {
  const c =
    s.toLowerCase().includes("kritis") || s.toLowerCase().includes("tinggi")
      ? "bg-danger text-white"
      : s.toLowerCase().includes("sedang")
        ? "bg-warn text-black"
        : "bg-line text-gray-200";
  return <span className={`badge ${c}`}>{s}</span>;
}

export default function PrdPage() {
  const [prd, setPrd] = useState("");
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [temuan, setTemuan] = useState<ReviewFinding[]>([]);
  const [jawaban, setJawaban] = useState<Record<string, string>>({});
  const [tcs, setTcs] = useState<TestCase[]>([]);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPrd(localStorage.getItem(LS.prd) || "");
    setReqs(load(LS.reqs, []));
    setTemuan(load(LS.temuan, []));
    setJawaban(load(LS.klarifikasi, {}));
    setTcs(load(LS.tcs, []));
    setReview(load(LS.review, null));
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setLoading(label);
    setError("");
    try {
      await fn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(null);
    }
  };

  const ekstrak = () =>
    run("Mengekstrak requirement…", async () => {
      const d = await postJson("/api/parse-prd", { prd, apiKey: getApiKey(), model: getModel() });
      setReqs(d.requirements);
      save(LS.reqs, d.requirements);
      save(LS.prd, prd);
    });

  const reviewPrd = () =>
    run("3 persona me-review PRD…", async () => {
      const d = await postJson("/api/review-prd", { requirements: reqs, apiKey: getApiKey(), model: getModel() });
      setTemuan(d.temuan);
      save(LS.temuan, d.temuan);
    });

  const generate = () =>
    run("Membuat test case…", async () => {
      const klarifikasi = Object.entries(jawaban)
        .filter(([, v]) => v.trim())
        .map(([q, v]) => `Q: ${q}\nA: ${v}`)
        .join("\n\n");
      const d = await postJson("/api/generate-testcases", {
        requirements: reqs,
        klarifikasi,
        apiKey: getApiKey(),
        model: getModel(),
      });
      setTcs(d.testcases);
      save(LS.tcs, d.testcases);
      save(LS.klarifikasi, jawaban);
      // Test case ikut dipakai di halaman Uji Endpoint
      localStorage.setItem("qae_testcases_exec", JSON.stringify(d.testcases));
    });

  const reviewTc = () =>
    run("Me-review coverage…", async () => {
      const d = await postJson("/api/review-testcases", {
        requirements: reqs,
        testcases: tcs,
        apiKey: getApiKey(),
        model: getModel(),
      });
      setReview(d);
      save(LS.review, d);
    });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setPrd(text);
    localStorage.setItem(LS.prd, text);
  };

  const pertanyaanUnik = temuan.filter((t) => t.pertanyaan && t.pertanyaan.trim() !== "-");

  return (
    <div>
      <ApiKeyBar />
      {error && <div className="card mb-4 !border-danger text-sm text-red-300">{error}</div>}

      {/* LANGKAH 1 — PRD */}
      <section className="card mb-5">
        <h2 className="font-bold text-lg mb-1">Langkah 1 — Tempel PRD</h2>
        <p className="text-sm text-gray-400 mb-3">Teks PRD / spesifikasi fitur. Bisa juga upload file .txt/.md.</p>
        <textarea
          className="input h-48 font-mono"
          placeholder="Contoh: Fitur login… user memasukkan email & password… dst."
          value={prd}
          onChange={(e) => setPrd(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="btn-ghost cursor-pointer">
            Upload file
            <input type="file" accept=".txt,.md,.markdown" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button className="btn-primary" disabled={loading !== null || !prd.trim()} onClick={ekstrak}>
            {loading === "Mengekstrak requirement…" ? loading : "Ekstrak Requirement →"}
          </button>
        </div>
      </section>

      {/* LANGKAH 2 — REQUIREMENTS */}
      {reqs.length > 0 && (
        <section className="card mb-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-bold text-lg">Langkah 2 — Requirement ({reqs.length})</h2>
            <button className="btn-primary ml-auto" disabled={loading !== null} onClick={reviewPrd}>
              {loading === "3 persona me-review PRD…" ? loading : "Review PRD — 3 Persona →"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="grid">
              <thead>
                <tr><th>ID</th><th>Judul</th><th>Deskripsi</th><th>Acceptance Criteria</th></tr>
              </thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-accent whitespace-nowrap">{r.id}</td>
                    <td className="font-semibold whitespace-nowrap">{r.judul}</td>
                    <td>{r.deskripsi}</td>
                    <td className="text-gray-400">{r.acceptance_criteria}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* LANGKAH 3 — REVIEW 3 PERSONA + KLARIFIKASI */}
      {temuan.length > 0 && (
        <section className="card mb-5">
          <h2 className="font-bold text-lg mb-1">Langkah 3 — Hasil Review 3 Persona ({temuan.length} temuan)</h2>
          <p className="text-sm text-gray-400 mb-3">
            QA = testability · Engineer = feasibility & edge teknis · Product = konsistensi & acceptance criteria.
            Jawab pertanyaan klarifikasi di bawah (human check), lalu generate test case.
          </p>
          <div className="overflow-x-auto mb-5">
            <table className="grid">
              <thead>
                <tr><th>REQ-ID</th><th>Masalah</th><th>Severity</th><th>Pertanyaan Klarifikasi</th><th>Persona</th></tr>
              </thead>
              <tbody>
                {temuan.map((t, i) => (
                  <tr key={i}>
                    <td className="font-mono text-accent whitespace-nowrap">{t.req_id}</td>
                    <td><span className="text-gray-500 text-xs block">{t.requirement}</span>{t.masalah}</td>
                    <td className="whitespace-nowrap">{sevBadge(t.severity)}</td>
                    <td className="text-gray-300">{t.pertanyaan}</td>
                    <td><span className="badge bg-line text-gray-200">{t.persona}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pertanyaanUnik.length > 0 && (
            <>
              <h3 className="font-bold mb-2">Pertanyaan klarifikasi — jawab di sini</h3>
              <div className="grid gap-3 mb-4">
                {pertanyaanUnik.map((t, i) => {
                  const key = `${t.req_id}::${t.pertanyaan}`;
                  return (
                    <div key={i} className="rounded-lg border border-line p-3">
                      <p className="text-sm mb-2"><span className="font-mono text-accent text-xs">{t.req_id}</span> — {t.pertanyaan}</p>
                      <input
                        className="input"
                        placeholder="Tulis jawaban / keputusan…"
                        value={jawaban[key] || ""}
                        onChange={(e) => setJawaban({ ...jawaban, [key]: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <button className="btn-primary" disabled={loading !== null} onClick={generate}>
            {loading === "Membuat test case…" ? loading : "Generate Test Case →"}
          </button>
        </section>
      )}

      {/* LANGKAH 4 — TEST CASES */}
      {tcs.length > 0 && (
        <section className="card mb-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-bold text-lg">Langkah 4 — Test Case ({tcs.length})</h2>
            <div className="ml-auto flex flex-wrap gap-2">
              <button className="btn-ghost" disabled={loading !== null} onClick={reviewTc}>
                {loading === "Me-review coverage…" ? loading : "Review Coverage →"}
              </button>
              <button className="btn-ghost" disabled={loading !== null} onClick={() => run("Export CSV…", () => exportFile("csv", tcs))}>CSV</button>
              <button className="btn-ghost" disabled={loading !== null} onClick={() => run("Export Excel…", () => exportFile("xlsx", tcs))}>Excel</button>
              <button className="btn-ghost" disabled={loading !== null} onClick={() => run("Export Word…", () => exportFile("docx", tcs))}>Word</button>
              <button className="btn-ghost" disabled={loading !== null} onClick={() => downloadBlob(new Blob([JSON.stringify(tcs, null, 2)], { type: "application/json" }), "qae-testcases.json")}>JSON</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="grid">
              <thead>
                <tr><th>TC-ID</th><th>REQ-ID</th><th>Judul</th><th>Tipe</th><th>Prioritas</th><th>Steps → Expected</th></tr>
              </thead>
              <tbody>
                {tcs.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono whitespace-nowrap">{t.id}</td>
                    <td className="font-mono text-accent whitespace-nowrap">{t.req_id}</td>
                    <td className="font-semibold">{t.judul}<span className="block text-xs font-normal text-gray-500">Pre: {t.precondition}</span></td>
                    <td className="whitespace-nowrap"><span className="badge bg-line">{t.tipe}</span></td>
                    <td className="whitespace-nowrap">{t.prioritas}</td>
                    <td>
                      <ol className="list-decimal list-inside text-gray-300">
                        {t.steps.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                      <p className="mt-1 text-accent">→ {t.expected_result}</p>
                      <p className="text-xs text-gray-500">Oracle: {t.oracle}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* LANGKAH 5 — COVERAGE REVIEW */}
      {review && (
        <section className="card mb-5">
          <h2 className="font-bold text-lg mb-3">Langkah 5 — Review Coverage & Traceability</h2>
          <div className="overflow-x-auto mb-4">
            <table className="grid">
              <thead>
                <tr><th>REQ-ID</th><th>Requirement</th><th>Jumlah TC</th><th>Tipe tercakup</th><th>Kurang</th><th>Status</th></tr>
              </thead>
              <tbody>
                {review.coverage.map((c) => (
                  <tr key={c.req_id}>
                    <td className="font-mono text-accent whitespace-nowrap">{c.req_id}</td>
                    <td>{c.judul}</td>
                    <td className="text-center">{c.jumlah}</td>
                    <td className="text-gray-400">{c.tipe_tercakup.join(", ") || "-"}</td>
                    <td className="text-warn">{c.tipe_kurang.join(", ") || "-"}</td>
                    <td>{c.tercakup ? <span className="badge bg-accent text-black">Tercakup</span> : <span className="badge bg-danger text-white">Belum penuh</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {review.tidak_tercakup.length > 0 && (
            <p className="text-sm text-red-300 mb-2">Belum tercakup sama sekali: {review.tidak_tercakup.join(", ")}</p>
          )}
          {review.duplikat.length > 0 && (
            <div className="text-sm text-warn mb-2">
              <p className="font-semibold">Duplikat terdeteksi:</p>
              <ul className="list-disc list-inside">
                {review.duplikat.map((d, i) => <li key={i}>{d.tc_ids.join(", ")} — {d.alasan}</li>)}
              </ul>
            </div>
          )}
          <p className="text-sm text-gray-300"><span className="font-semibold">Rekomendasi:</span> {review.rekomendasi}</p>
          <div className="mt-4">
            <a href="/eksekusi" className="btn-primary">Lanjut: Uji Endpoint Beneran →</a>
          </div>
        </section>
      )}
    </div>
  );
}
