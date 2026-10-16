"use client";
import { useEffect, useState } from "react";
import ApiKeyBar, { getApiKey, getModel } from "@/components/ApiKeyBar";
import { assertionLabel, type ApiCheck, type CheckResult, type TestCase } from "@/lib/qa";

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

export default function EksekusiPage() {
  const [tugas, setTugas] = useState("cek login");
  const [method, setMethod] = useState("POST");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState('{\n  "email": "user@contoh.id",\n  "password": "rahasia123"\n}');
  const [checks, setChecks] = useState<ApiCheck[]>([]);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [report, setReport] = useState("");
  const [reportMeta, setReportMeta] = useState("");
  const [testcases, setTestcases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const t = localStorage.getItem("qae_testcases_exec");
      if (t) setTestcases(JSON.parse(t));
    } catch { /* abaikan */ }
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

  const buatRencana = () =>
    run("AI menyusun rencana uji…", async () => {
      const d = await postJson("/api/plan-checks", {
        tugas,
        endpoint: { method, url, headers, body },
        testcases,
        apiKey: getApiKey(),
        model: getModel(),
      });
      setChecks(d.checks);
      setResults([]);
      setReport("");
    });

  const jalankan = () =>
    run("Menembak endpoint…", async () => {
      const d = await postJson("/api/run-tests", { checks });
      setResults(d.results);
    });

  const buatLaporan = () =>
    run("AI menulis laporan…", async () => {
      const d = await postJson("/api/report", { results, apiKey: getApiKey(), model: getModel() });
      setReport(d.markdown);
      setReportMeta(`${d.passed}/${d.total} lolos (${d.rate}%)`);
    });

  const exportDoc = (format: "xlsx" | "docx") =>
    run(`Export ${format}…`, async () => {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, testcases, results, report }),
      });
      if (!res.ok) {
        const dd = await res.json().catch(() => ({}));
        throw new Error(dd.error || "Gagal export.");
      }
      downloadBlob(await res.blob(), `qae-laporan.${format}`);
    });

  const passed = results.filter((r) => r.passed).length;

  return (
    <div>
      <ApiKeyBar />
      {error && <div className="card mb-4 !border-danger text-sm text-red-300">{error}</div>}

      <section className="card mb-5">
        <h2 className="font-bold text-lg mb-1">Uji Endpoint Beneran</h2>
        <p className="text-sm text-gray-400 mb-4">
          Ketik perintah seperti <span className="text-gray-200 font-mono">“cek login”</span>, isi endpoint,
          lalu AI menyusun rencana uji (positive, negative, injeksi, tanpa auth, …) dan{" "}
          <strong className="text-gray-200">server menembak endpoint tersebut betulan</strong> — bukan simulasi di atas kertas.
          {testcases.length > 0 && (
            <span className="text-accent"> {testcases.length} test case dari PRD ikut dijadikan inspirasi.</span>
          )}
        </p>
        <div className="grid gap-3">
          <div>
            <label className="label">Perintah / tugas</label>
            <input className="input" value={tugas} onChange={(e) => setTugas(e.target.value)} placeholder='mis. "cek login"' />
          </div>
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div>
              <label className="label">Method</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">URL Endpoint</label>
              <input className="input font-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.contoh.id/login" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Headers (JSON)</label>
              <textarea className="input h-28 font-mono" value={headers} onChange={(e) => setHeaders(e.target.value)} />
            </div>
            <div>
              <label className="label">Body (JSON)</label>
              <textarea className="input h-28 font-mono" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
          <div>
            <button className="btn-primary" disabled={loading !== null || !tugas.trim() || !url.trim()} onClick={buatRencana}>
              {loading === "AI menyusun rencana uji…" ? loading : "Buatkan Rencana Uji (AI) →"}
            </button>
          </div>
        </div>
      </section>

      {checks.length > 0 && (
        <section className="card mb-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-bold text-lg">Rencana Uji ({checks.length} check)</h2>
            <button className="btn-primary ml-auto" disabled={loading !== null} onClick={jalankan}>
              {loading === "Menembak endpoint…" ? loading : "Jalankan Pengujian"}
            </button>
          </div>
          <div className="grid gap-2">
            {checks.map((c) => (
              <div key={c.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold">
                  <span className="font-mono text-accent text-xs mr-2">{c.id}</span>{c.judul}
                  <span className="badge bg-line text-gray-300 ml-2">{c.kategori}</span>
                </p>
                <p className="font-mono text-xs text-gray-400 mt-1">{c.request.method} {c.request.url}</p>
                <p className="text-xs text-gray-500 mt-1">Assert: {c.assertions.map(assertionLabel).join(" · ") || "-"}</p>
                <p className="text-xs text-gray-600 mt-0.5">Oracle: {c.oracle}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="card mb-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-bold text-lg">
              Hasil — <span className={passed === results.length ? "text-accent" : "text-warn"}>{passed}/{results.length} lolos</span>
            </h2>
            <div className="ml-auto flex flex-wrap gap-2">
              <button className="btn-ghost" disabled={loading !== null} onClick={buatLaporan}>
                {loading === "AI menulis laporan…" ? loading : "Buat Laporan Bahasa Indonesia"}
              </button>
              <button className="btn-ghost" disabled={loading !== null} onClick={() => exportDoc("xlsx")}>Excel</button>
              <button className="btn-ghost" disabled={loading !== null} onClick={() => exportDoc("docx")}>Word</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="grid">
              <thead>
                <tr><th>ID</th><th>Check</th><th>Hasil</th><th>HTTP</th><th>Latensi</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono whitespace-nowrap">{r.id}</td>
                    <td className="font-semibold whitespace-nowrap">{r.judul}</td>
                    <td>{r.passed
                      ? <span className="badge bg-accent text-black">LOLOS</span>
                      : <span className="badge bg-danger text-white">GAGAL</span>}</td>
                    <td className="font-mono">{r.http_status ?? "-"}</td>
                    <td className="font-mono whitespace-nowrap">{r.latency_ms} ms</td>
                    <td className="text-xs">
                      {r.error && <p className="text-red-300">{r.error}</p>}
                      {r.assertions.map((a, i) => (
                        <p key={i} className={a.passed ? "text-gray-400" : "text-red-300"}>
                          {a.passed ? "✓" : "✗"} {a.message} <span className="text-gray-600">(aktual: {a.actual})</span>
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report && (
        <section className="card mb-5">
          <h2 className="font-bold text-lg mb-1">Laporan {reportMeta && <span className="text-gray-400 font-normal text-sm">· {reportMeta}</span>}</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans">{report}</pre>
        </section>
      )}
    </div>
  );
}
