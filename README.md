# QAE-Bot — AI QA Engineer

Web app AI QA Engineer berbahasa Indonesia. Alur kerja:

1. **Parser / Extractor** — tempel PRD → AI mengekstrak requirement bernomor (`REQ-001`, `REQ-002`, …).
2. **PRD Review (3 persona, paralel)** — QA (testability & ambiguitas), Engineer (feasibility & edge case teknis),
   Product/BA (konsistensi & acceptance criteria). Temuan digabung jadi **pertanyaan klarifikasi** untuk human check.
3. **Test Case Generator** — tiap requirement dapat minimal **1 Positive, 1 Negative, 1 Boundary/Edge**.
   Tiap test case wajib menunjuk `REQ-ID`. Anti-tautologi: setiap ekspektasi punya **oracle independen**
   (dari PRD/standar, bukan mengulang implementasi).
4. **Test Case Reviewer** — cek coverage, duplikat, dan traceability. Requirement yang belum tercakup ditandai.
5. **Uji endpoint beneran** — ketik mis. “cek login”, kasih endpoint → AI menyusun check (positive, negative,
   injeksi, tanpa auth, …) lalu **server menembak endpoint tersebut betulan** dan menilai assertion-nya.
6. **Laporan Bahasa Indonesia** + export **CSV / Excel / Word / JSON**.

> Catatan: pengujian endpoint dijalankan dari **server** tempat app ini di-deploy (VPS kamu),
> jadi “dia jalanin test di VPS saya” — betul.

## Syarat

- Node.js 20+ (atau Docker)
- **DeepSeek API key** — dapatkan di https://platform.deepseek.com/api_keys

## Jalankan lokal (tanpa Docker)

```bash
npm install
npm run dev
# buka http://localhost:3000
```

## Deploy di VPS (Docker Compose)

```bash
# opsional: agar semua pengguna tidak perlu isi API key di UI
export DEEPSEEK_API_KEY=sk-...

make up
# buka http://IP-VPS:3002
```

Perintah lain: `make logs`, `make down`.

## Cara pakai

1. Buka halaman **PRD → Test Case**, isi API key DeepSeek di bilah atas (tersimpan di browser masing-masing).
2. Tempel PRD → **Ekstrak Requirement** → **Review PRD — 3 Persona**.
3. Jawab pertanyaan klarifikasi → **Generate Test Case** → **Review Coverage**.
4. Export ke CSV/Excel/Word/JSON, atau lanjut ke **Uji Endpoint**:
   tulis perintah (“cek login”), isi method + URL + headers + body → **Buatkan Rencana Uji (AI)** →
   **Jalankan Pengujian** → **Buat Laporan Bahasa Indonesia**.

## Struktur

```
app/
  page.tsx            → beranda + alur kerja
  prd/page.tsx        → wizard PRD → requirement → review → test case → coverage
  eksekusi/page.tsx   → uji endpoint + laporan
  api/
    parse-prd/        → ekstrak REQ-001…
    review-prd/       → 3 persona paralel
    generate-testcases/ → positive/negative/boundary/edge per requirement
    review-testcases/ → coverage, duplikat, traceability
    plan-checks/      → susun check API dari perintah + endpoint
    run-tests/        → eksekusi HTTP beneran + evaluasi assertion
    report/           → laporan Bahasa Indonesia (AI)
    export/           → CSV / XLSX / DOCX
lib/
  qa.ts               → klien DeepSeek, tipe, prompt anti-tautologi
  pipeline.ts         → prompt pipeline PRD (extractor, 3 persona, generator, reviewer)
```

## Keamanan

- API key hanya dipakai server-side untuk memanggil `api.deepseek.com`, tidak disimpan di mana pun
  (kecuali kamu sengaja set `DEEPSEEK_API_KEY` di server).
- Endpoint yang diuji hanya boleh `http://`/`https://`; request timeout 20 detik per check.
