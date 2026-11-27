"use client";

import React, { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from "../../../../../_components/ui";
import { Icon } from "../../../../../_components/admin-icons";
import { Avatar2D } from "../../../../../_components/agent/avatar-2d";
import type { AvatarConfig } from "../../../../../_components/agent/avatar-config";
import type { FormationInterface, FormationMessage } from "../../../formation-types";
import { useSendAnswers } from "../../../hooks/formation";

type Draft = Record<string, { text: string; skipped: boolean }>;

const time = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Bubble({ message, avatar, answer }: { message: FormationMessage; avatar: AvatarConfig; answer?: FormationMessage }) {
  const mine = message.author === "member";
  return (
    <div className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && (
        <div className="w-9 h-9 rounded-xl bg-brand-soft flex items-end justify-center overflow-hidden shrink-0">
          <Avatar2D avatar={avatar} size={34} />
        </div>
      )}
      <div className={`max-w-[85%] space-y-1 ${mine ? "items-end text-right" : ""}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            mine
              ? "bg-gradient-to-r from-brand to-[#9b6bff] text-white rounded-tr-md"
              : message.kind === "objection"
                ? "bg-rose-50 text-rose-900 border border-rose-200 rounded-tl-md dark:bg-rose-500/10 dark:text-rose-200"
                : "bg-surface border border-line text-ink rounded-tl-md"
          }`}
        >
          {message.kind === "objection" && <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5">Keberatan</p>}
          {message.kind === "note" && mine && <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-80">Catatan</p>}
          {message.skipped ? <span className="italic opacity-80">{message.text}</span> : message.text}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] text-faint ${mine ? "justify-end" : ""}`}>
          <span>{message.author_name}</span>
          <span>·</span>
          <span>{time(message.created_at)}</span>
          {message.kind === "question" && (
            <Badge size="sm" variant={message.required ? "warning" : "neutral"}>
              {message.required ? "Wajib" : "Opsional"}
            </Badge>
          )}
          {message.kind === "question" && answer && (
            <Badge size="sm" variant="success">
              {answer.skipped ? "Dilewati" : "Terjawab"}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StepTanyaJawab({
  agentId,
  agentName,
  avatar,
  formation,
  canEdit,
  onNext,
}: {
  agentId: string;
  agentName: string;
  avatar: AvatarConfig;
  formation: FormationInterface;
  canEdit: boolean;
  onNext: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState("");
  const send = useSendAnswers(agentId);

  const answers = new Map(formation.messages.filter((m) => m.kind === "answer").map((m) => [m.question_id, m]));
  const pending = formation.messages.filter((m) => m.kind === "question" && !answers.has(m.id));
  const rounds = [...new Set(formation.messages.map((m) => m.round_no))].sort((a, b) => a - b);
  const locked = !canEdit || formation.processing || !formation.card;

  const set = (questionId: string, value: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [questionId]: { text: d[questionId]?.text ?? "", skipped: d[questionId]?.skipped ?? false, ...value } }));

  const submit = (finish: boolean) => {
    const body = {
      answers: Object.entries(draft)
        .filter(([, v]) => v.skipped || v.text.trim())
        .map(([question_id, v]) => ({ question_id, text: v.text.trim(), skipped: v.skipped })),
      note: note.trim(),
      finish,
    };
    send.mutate(body, {
      onSuccess: () => {
        setDraft({});
        setNote("");
      },
    });
  };

  const filled = Object.values(draft).some((v) => v.skipped || v.text.trim()) || note.trim().length > 0;

  if (!formation.card) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted">Tanya jawab dimulai setelah analisis selesai.</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Percakapan dengan {agentName}</CardTitle>
          <Badge size="sm" variant="info">
            Putaran {formation.round_no}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5 max-h-[640px] overflow-y-auto">
          {rounds.map((round) => (
            <div key={round} className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-faint">
                <span className="h-px flex-1 bg-line" />
                Putaran {round}
                <span className="h-px flex-1 bg-line" />
              </div>
              {formation.messages
                .filter((m) => m.round_no === round)
                .map((m) => (
                  <Bubble key={m.id} message={m} avatar={avatar} answer={m.kind === "question" ? answers.get(m.id) : undefined} />
                ))}
            </div>
          ))}
          {formation.processing && (
            <div className="flex items-center gap-2 text-xs text-muted" role="status">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              {agentName} sedang membaca jawaban dan memperbarui kartu…
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-5">
        {formation.agent_satisfied && !formation.processing ? (
          <Card glow>
            <CardContent className="space-y-3 text-center">
              <Icon name="check" size={26} className="mx-auto text-emerald-600" />
              <p className="font-bold text-ink">{agentName} sudah jelas</p>
              <p className="text-xs text-muted">Periksa isian kerja di langkah Final. Anda masih bisa menambah catatan di bawah.</p>
              <Button className="w-full" onClick={onNext} icon={<Icon name="arrow" size={15} />}>
                Ke Final
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canEdit && pending.length > 0 && !formation.processing && (
          <Card>
            <CardHeader>
              <CardTitle>Jawab pertanyaan</CardTitle>
              <Badge size="sm" variant="warning">
                {pending.length} terbuka
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {pending.map((q) => {
                const value = draft[q.id] ?? { text: "", skipped: false };
                return (
                  <div key={q.id} className="space-y-2">
                    <p className="text-xs font-semibold text-ink leading-relaxed">
                      {q.text} {q.required && <span className="text-red-500">*</span>}
                    </p>
                    <Textarea
                      rows={2}
                      value={value.text}
                      disabled={locked || value.skipped}
                      onChange={(e) => set(q.id, { text: e.target.value, skipped: false })}
                      placeholder="Tulis jawaban"
                      maxLength={2000}
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => set(q.id, value.skipped && value.text === "Dilewati" ? { skipped: false, text: "" } : { skipped: true, text: "Dilewati" })}
                        className={`h-7 px-2.5 rounded-xl text-[11px] font-semibold border cursor-pointer ${value.skipped && value.text === "Dilewati" ? "bg-night text-white border-night" : "bg-surface border-line text-muted hover:text-ink"}`}
                      >
                        Lewati
                      </button>
                      <button
                        type="button"
                        onClick={() => set(q.id, value.skipped && value.text === "Tidak tahu" ? { skipped: false, text: "" } : { skipped: true, text: "Tidak tahu" })}
                        className={`h-7 px-2.5 rounded-xl text-[11px] font-semibold border cursor-pointer ${value.skipped && value.text === "Tidak tahu" ? "bg-night text-white border-night" : "bg-surface border-line text-muted hover:text-ink"}`}
                      >
                        Tidak tahu
                      </button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {canEdit && (
          <Card>
            <CardContent className="space-y-3">
              <Textarea
                label="Catatan atau instruksi tambahan"
                rows={3}
                value={note}
                disabled={locked}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`mis. "${agentName}, laporan selalu memakai kop terbaru."`}
                maxLength={2000}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => (formation.agent_satisfied && !filled ? onNext() : submit(true))}
                  disabled={locked}
                  loading={send.isPending && !filled}
                >
                  Cukup, ke Final
                </Button>
                <Button onClick={() => submit(false)} disabled={locked || !filled} loading={send.isPending && filled}>
                  Kirim jawaban
                </Button>
              </div>
              <p className="text-[11px] text-faint">Setiap kiriman memperbarui kartu keterampilan; bagian yang berubah disorot.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
