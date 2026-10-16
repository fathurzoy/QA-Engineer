import ApiKeyBar from "@/components/ApiKeyBar";

const STEPS = [
  {
    n: "1",
    judul: "Parser / Extractor",
    deskripsi: "Tempel PRD → AI mengekstrak daftar requirement bernomor REQ-001, REQ-002, …",
    href: "/prd",
  },
  {
    n: "2",
    judul: "PRD Review — 3 Persona",
    deskripsi: "QA (testability), Engineer (feasibility & edge teknis), Product (konsistensi & AC) jalan paralel.",
    href: "/prd",
  },
  {
    n: "3",
    judul: "Klarifikasi (Human Check)",
    deskripsi: "Temuan digabung jadi pertanyaan klarifikasi. Kamu jawab / konfirmasi sebelum lanjut.",
    href: "/prd",
  },
  {
    n: "4",
    judul: "Test Case Generator",
    deskripsi: "Tiap requirement dapat minimal 1 Positive, 1 Negative, 1 Boundary/Edge. Tiap TC menunjuk REQ-ID.",
    href: "/prd",
  },
  {
    n: "5",
    judul: "Test Case Reviewer",
    deskripsi: "Cek coverage, duplikat, dan traceability ke REQ-ID. Requirement yang belum tercakup ditandai.",
    href: "/prd",
  },
  {
    n: "6",
    judul: "Uji Endpoint Beneran",
    deskripsi: "Ketik mis. “cek login”, kasih endpoint → AI susun check lalu MENEMBAK server betulan (bukan simulasi kertas).",
    href: "/eksekusi",
  },
];

export default function Home() {
  return (
    <div>
      <ApiKeyBar />
      <div className="card mb-6 !p-8">
        <h1 className="text-3xl font-black mb-2">
          AI QA Engineer <span className="text-accent">yang beneran ngetes.</span>
        </h1>
        <p className="text-gray-300 max-w-3xl">
          QAE-Bot mengubah PRD menjadi requirement terstruktur, me-review-nya dengan 3 persona,
          menghasilkan test case <em>positive, negative, boundary, edge</em> yang anti-tautologi
          (setiap ekspektasi punya oracle independen — bukan assert yang mengulang kode),
          lalu mengeksekusi pengujian API <strong>betulan</strong> ke endpoint kamu.
          Semua laporan berbahasa Indonesia, bisa di-export ke <strong>CSV / Excel / Word</strong>.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/prd" className="btn-primary">Mulai dari PRD</a>
          <a href="/eksekusi" className="btn-ghost">Langsung uji endpoint</a>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-3">Alur kerja</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s) => (
          <a key={s.n} href={s.href} className="card hover:border-accent transition">
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-line font-black text-accent">{s.n}</span>
              <h3 className="font-bold">{s.judul}</h3>
            </div>
            <p className="text-sm text-gray-400">{s.deskripsi}</p>
          </a>
        ))}
      </div>

      <div className="card mt-6">
        <h2 className="text-lg font-bold mb-2">Kenapa anti-tautologi?</h2>
        <p className="text-sm text-gray-300">
          Test tautologis itu yang “lolos di atas kertas” tapi tidak menguji apa-apa — misalnya meng-assert
          response sama persis dengan yang baru dikirim, tanpa oracle independen. QAE-Bot mewajibkan setiap
          ekspektasi dilacak ke PRD/acceptance criteria/standar (mis. semantik HTTP), plus kasus negatif,
          boundary, dan adversarial (injeksi, auth, format tak valid) di setiap fiturnya.
        </p>
      </div>
    </div>
  );
}
