"use client";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { API_KEY_STATUS, type ResponseInterface } from "../types";

const time = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

export default function ApiKeyPanel({ settings, canSee }: { settings: ResponseInterface; canSee: boolean }) {
  const active = settings.api_keys.filter((k) => k.status === "active").length;

  return (
    <div className="grid gap-4 xl:grid-cols-3 items-start">
      <Card className="xl:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Status kunci API</CardTitle>
            <p className="text-xs text-muted mt-0.5">
              Kunci diisi di <span className="font-mono">server/.env</span>. Nilainya tidak pernah ditampilkan atau dikirim ke peramban.
            </p>
          </div>
          {canSee && (
            <Badge size="sm" variant={active ? "success" : "danger"} dot>
              {active} aktif
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {!canSee ? (
            <p className="text-sm text-muted">Status kunci hanya terlihat oleh pemilik.</p>
          ) : (
            <ul className="space-y-2.5 stagger">
              {settings.api_keys.map((k) => {
                const status = API_KEY_STATUS[k.status];
                return (
                  <li key={k.env_name} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                    <span
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        k.status === "active" ? "bg-emerald-100 text-emerald-700" : k.status === "cooling" ? "bg-amber-100 text-amber-700" : "bg-canvas text-faint"
                      }`}
                    >
                      <Icon name="shield" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13px] font-semibold text-ink truncate">{k.env_name}</p>
                      <p className="text-[11px] text-faint">
                        {k.status === "not_set"
                          ? "Tidak dipakai"
                          : `${k.requests_today} permintaan hari ini · terakhir ${time(k.last_used_at)}`}
                        {k.cooldown_until && ` · dipakai lagi ${time(k.cooldown_until)}`}
                      </p>
                    </div>
                    <Badge size="sm" variant={status.variant}>
                      {status.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="rounded-3xl bg-gradient-to-br from-night to-[#2d2150] text-white p-5 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Rotasi kunci</p>
          <p className="text-sm leading-relaxed text-white/85">
            Kunci yang kena batas permintaan diistirahatkan sementara, lalu permintaan pindah ke kunci berikutnya.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-1">
            <p className="text-xs font-semibold text-muted">Embedding dokumen</p>
            <p className="font-mono text-sm font-bold text-ink">{settings.embedding.model}</p>
            <p className="text-[11px] text-faint">
              {settings.embedding.dimension} dimensi. Tidak bisa diganti di sini karena seluruh dokumen harus diolah ulang.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
