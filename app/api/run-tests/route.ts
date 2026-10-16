import { NextRequest, NextResponse } from "next/server";
import type { ApiCheck, Assertion, AssertionResult, CheckResult } from "@/lib/qa";

const TIMEOUT_MS = 20000;

function getPath(obj: unknown, path: string): { found: boolean; value: unknown } {
  let cur: unknown = obj;
  for (const p of path.split(".").filter(Boolean)) {
    if (cur !== null && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: cur };
}

function evalAssertion(
  a: Assertion,
  ctx: { status: number; text: string; json: unknown; latency: number }
): AssertionResult {
  const fail = (actual: string, message: string): AssertionResult => ({ assertion: a, passed: false, actual, message });
  const pass = (actual: string, message: string): AssertionResult => ({ assertion: a, passed: true, actual, message });
  switch (a.type) {
    case "status_eq":
      return ctx.status === a.value
        ? pass(String(ctx.status), `Status ${ctx.status} sesuai harapan.`)
        : fail(String(ctx.status), `Status ${ctx.status}, diharapkan ${a.value}.`);
    case "status_range":
      return ctx.status >= a.min && ctx.status <= a.max
        ? pass(String(ctx.status), `Status ${ctx.status} dalam rentang ${a.min}–${a.max}.`)
        : fail(String(ctx.status), `Status ${ctx.status} di luar rentang ${a.min}–${a.max}.`);
    case "body_contains":
      return ctx.text.includes(a.value)
        ? pass("ditemukan", `Body mengandung "${a.value}".`)
        : fail("tidak ditemukan", `Body TIDAK mengandung "${a.value}".`);
    case "body_json_has": {
      if (ctx.json === null) return fail("bukan JSON", `Body bukan JSON, path "${a.path}" tidak bisa dicek.`);
      const r = getPath(ctx.json, a.path);
      return r.found
        ? pass(JSON.stringify(r.value)?.slice(0, 120) || "ada", `Path "${a.path}" ada di body.`)
        : fail("tidak ada", `Path "${a.path}" TIDAK ada di body JSON.`);
    }
    case "body_json_eq": {
      if (ctx.json === null) return fail("bukan JSON", `Body bukan JSON, path "${a.path}" tidak bisa dicek.`);
      const r = getPath(ctx.json, a.path);
      if (!r.found) return fail("tidak ada", `Path "${a.path}" TIDAK ada di body JSON.`);
      const ok = JSON.stringify(r.value) === JSON.stringify(a.value);
      return ok
        ? pass(JSON.stringify(r.value), `"${a.path}" bernilai sesuai harapan.`)
        : fail(JSON.stringify(r.value), `"${a.path}" = ${JSON.stringify(r.value)}, diharapkan ${JSON.stringify(a.value)}.`);
    }
    case "latency_lt_ms":
      return ctx.latency < a.value
        ? pass(`${ctx.latency} ms`, `Latensi ${ctx.latency} ms di bawah ${a.value} ms.`)
        : fail(`${ctx.latency} ms`, `Latensi ${ctx.latency} ms melebihi batas ${a.value} ms.`);
  }
}

async function runCheck(check: ApiCheck): Promise<CheckResult> {
  const base = {
    id: check.id,
    judul: check.judul,
    passed: false,
    latency_ms: 0,
    http_status: null as number | null,
    assertions: [] as AssertionResult[],
    response_snippet: "",
  };
  let url: URL;
  try {
    url = new URL(check.request.url);
  } catch {
    return { ...base, error: `URL tidak valid: ${check.request.url}` };
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return { ...base, error: `Protokol ${url.protocol} tidak didukung (hanya http/https).` };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(check.request.url, {
      method: check.request.method,
      headers: check.request.headers,
      body: check.request.body ? check.request.body : undefined,
      signal: ctrl.signal,
      redirect: "manual",
    });
    const latency = Date.now() - start;
    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* bukan JSON, tidak apa-apa */
    }
    const assertions = check.assertions.map((a) => evalAssertion(a, { status: res.status, text, json, latency }));
    return {
      ...base,
      passed: assertions.length > 0 && assertions.every((r) => r.passed),
      latency_ms: latency,
      http_status: res.status,
      assertions,
      response_snippet: text.slice(0, 2000),
    };
  } catch (e: unknown) {
    const latency = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...base,
      latency_ms: latency,
      error: /abort/i.test(msg) ? `Timeout ${TIMEOUT_MS / 1000} detik — server tidak merespons.` : `Gagal menghubungi server: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { checks } = await req.json();
    if (!Array.isArray(checks) || !checks.length) {
      return NextResponse.json({ error: "Belum ada check untuk dijalankan." }, { status: 400 });
    }
    if (checks.length > 50) {
      return NextResponse.json({ error: "Maksimal 50 check per eksekusi." }, { status: 400 });
    }
    // Jalankan berurutan agar tidak membanjiri server target (seperti QA manusia: satu per satu).
    const results: CheckResult[] = [];
    for (const c of checks as ApiCheck[]) {
      results.push(await runCheck(c));
    }
    return NextResponse.json({ results });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal menjalankan pengujian." }, { status: 500 });
  }
}
