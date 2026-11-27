"use client";

import React from "react";
import { Badge, Input, Select } from "../../../_components/ui";
import {
  CATEGORY_LABEL,
  POLICY_KIND_LABEL,
  SOURCE_KIND_LABEL,
  type PolicyFields,
  type PolicyInfo,
  type PolicyKind,
  type ResponseInterface,
  type SourceKind,
} from "../types";

const today = () => new Date().toISOString().slice(0, 10);

/** Keadaan berlaku sebuah kebijakan dalam kata-kata. */
export const policyState = (p: PolicyInfo): { label: string; variant: "success" | "danger" | "warning" | "neutral" } => {
  if (p.status === "dicabut") return { label: "Dicabut", variant: "danger" };
  if (p.effective_from && p.effective_from > today()) return { label: "Belum berlaku", variant: "warning" };
  if (p.effective_until && p.effective_until < today()) return { label: "Lewat masa berlaku", variant: "neutral" };
  return { label: "Berlaku", variant: "success" };
};

/** Penanda kategori dokumen selain dokumen biasa: kebijakan, uraian jabatan, hasil tanya jawab, temuan internet. */
export function CategoryBadges({ doc }: { doc: ResponseInterface }) {
  if (doc.category === "policy" && doc.policy) {
    const state = policyState(doc.policy);
    return (
      <>
        <Badge size="sm" variant="danger">
          {POLICY_KIND_LABEL[doc.policy.kind]}
        </Badge>
        {doc.policy.reference_no && <span className="text-[11px] font-semibold text-muted">{doc.policy.reference_no}</span>}
        <Badge size="sm" variant={state.variant} dot>
          {state.label}
        </Badge>
      </>
    );
  }
  if (doc.category === "knowledge") return null;
  return (
    <Badge size="sm" variant={doc.category === "qa" ? "accent" : "neutral"}>
      {CATEGORY_LABEL[doc.category]}
    </Badge>
  );
}

/** Asal rujukan, sesuai urutan rujukan: Aturan → Tanya jawab → Dokumen → Internet. */
export function SourceKindBadge({ kind }: { kind: SourceKind }) {
  const s = SOURCE_KIND_LABEL[kind];
  return (
    <Badge size="sm" variant={s.variant}>
      {s.label}
    </Badge>
  );
}

export const emptyPolicy = (): PolicyFields => ({
  kind: "kebijakan",
  reference_no: "",
  issuer: "",
  effective_from: null,
  effective_until: null,
  status: "berlaku",
});

/** Isian keterangan kebijakan; dipakai saat mengunggah dan di detail dokumen. */
export function PolicyFieldsForm({
  value,
  onChange,
  withStatus = false,
}: {
  value: PolicyFields;
  onChange: (next: PolicyFields) => void;
  /** Status berlaku/dicabut hanya diubah setelah dokumen ada */
  withStatus?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label="Jenis aturan"
        value={value.kind}
        onChange={(e) => onChange({ ...value, kind: e.target.value as PolicyKind })}
        options={Object.entries(POLICY_KIND_LABEL).map(([v, label]) => ({ value: v, label }))}
      />
      <Input label="Nomor atau kode" value={value.reference_no} onChange={(e) => onChange({ ...value, reference_no: e.target.value })} placeholder="mis. KEP-07/2026" maxLength={100} />
      <Input label="Ditetapkan oleh" value={value.issuer} onChange={(e) => onChange({ ...value, issuer: e.target.value })} placeholder="mis. Direksi, Pimpinan" maxLength={150} />
      {withStatus ? (
        <Select
          label="Status"
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as PolicyFields["status"] })}
          options={[
            { value: "berlaku", label: "Berlaku" },
            { value: "dicabut", label: "Dicabut" },
          ]}
        />
      ) : (
        <span className="hidden sm:block" />
      )}
      <Input label="Mulai berlaku" type="date" value={value.effective_from ?? ""} onChange={(e) => onChange({ ...value, effective_from: e.target.value || null })} />
      <Input
        label="Berlaku sampai"
        type="date"
        value={value.effective_until ?? ""}
        onChange={(e) => onChange({ ...value, effective_until: e.target.value || null })}
        helperText="Kosongkan bila tidak dibatasi."
      />
    </div>
  );
}
