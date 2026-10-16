import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QAE-Bot — AI QA Engineer",
  description:
    "AI QA Engineer: ekstrak requirement dari PRD, review 3 persona, generate test case (positive/negative/boundary/edge), uji endpoint beneran, laporan Bahasa Indonesia. Powered by DeepSeek.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-black text-black">Q</span>
              <span className="font-bold text-lg">QAE-Bot <span className="text-gray-400 font-normal text-sm">· AI QA Engineer</span></span>
            </a>
            <nav className="flex gap-1 text-sm">
              <a href="/" className="px-3 py-1.5 rounded-lg hover:bg-line">Beranda</a>
              <a href="/prd" className="px-3 py-1.5 rounded-lg hover:bg-line">PRD → Test Case</a>
              <a href="/eksekusi" className="px-3 py-1.5 rounded-lg hover:bg-line">Uji Endpoint</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-gray-500">
          QAE-Bot · AI QA Engineer · Powered by DeepSeek · Laporan berbahasa Indonesia
        </footer>
      </body>
    </html>
  );
}
