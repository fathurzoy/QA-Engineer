"use client";
import { useEffect, useState } from "react";

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("qae_deepseek_key") || "";
}
export function getModel(): string {
  if (typeof window === "undefined") return "deepseek-chat";
  return localStorage.getItem("qae_deepseek_model") || "deepseek-chat";
}

/** Bilah API key DeepSeek — disimpan di browser masing-masing, tidak dikirim ke mana pun selain DeepSeek. */
export default function ApiKeyBar() {
  const [key, setKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setKey(localStorage.getItem("qae_deepseek_key") || "");
    setModel(localStorage.getItem("qae_deepseek_model") || "deepseek-chat");
  }, []);

  const save = () => {
    localStorage.setItem("qae_deepseek_key", key.trim());
    localStorage.setItem("qae_deepseek_model", model);
    setOpen(false);
  };

  const filled = key.trim().length > 0;

  return (
    <div className="card mb-5 !p-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${filled ? "bg-accent" : "bg-warn"}`} />
        <span className="text-sm font-semibold">
          {filled ? `DeepSeek terhubung (${model})` : "API key DeepSeek belum diisi"}
        </span>
      </div>
      <button className="btn-ghost ml-auto" onClick={() => setOpen(!open)}>
        {open ? "Tutup" : filled ? "Ganti key" : "Isi API key"}
      </button>
      {open && (
        <div className="w-full grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <div>
            <label className="label">DeepSeek API Key</label>
            <input
              type="password"
              className="input"
              placeholder="sk-..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Model</label>
            <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="deepseek-chat">deepseek-chat</option>
              <option value="deepseek-reasoner">deepseek-reasoner</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" onClick={save}>Simpan</button>
          </div>
          <p className="text-xs text-gray-500 sm:col-span-3">
            Key hanya tersimpan di browser kamu dan dipakai langsung ke api.deepseek.com. Atau set
            DEEPSEEK_API_KEY di server agar semua pengguna tidak perlu mengisi.
          </p>
        </div>
      )}
    </div>
  );
}
