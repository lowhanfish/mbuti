"use client";

import React, { useState } from "react";
import { Button } from "../../../_components/ui";

export default function RecoveryCodeList({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const save = () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`Kode cadangan MBUTI\n\n${text}\n`], { type: "text/plain" }));
    link.download = "kode-cadangan-mbuti.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted leading-relaxed">
        Simpan kode ini di tempat aman. Tiap kode bisa dipakai <strong className="text-ink">sekali</strong> untuk masuk bila
        ponsel Anda hilang. Kode tidak akan ditampilkan lagi.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-canvas p-3 font-mono text-sm" aria-label="Kode cadangan">
        {codes.map((code) => (
          <li key={code} className="text-center text-ink select-all">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? "Tersalin" : "Salin"}
        </Button>
        <Button size="sm" variant="outline" onClick={save}>
          Unduh berkas teks
        </Button>
      </div>
    </div>
  );
}
