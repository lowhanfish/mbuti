"use client";

import React from "react";
import { Input, Select } from "../../../_components/ui";
import { useResponseListFlow } from "../../alur/hooks/crud";

export interface FlowChoice {
  flow_id: string;
  flow_values: Record<string, string>;
}

export const NO_FLOW: FlowChoice = { flow_id: "", flow_values: {} };

/** Alur aplikasi yang dijalankan sesudah pekerjaan role selesai (E4c). */
export default function FlowSelect({ roleId, value, onChange }: { roleId: string; value: FlowChoice; onChange: (v: FlowChoice) => void }) {
  const { Flows } = useResponseListFlow(roleId);
  const usable = Flows?.can_manage ? Flows.flows.filter((f) => f.status === "approved") : [];
  const selected = usable.find((f) => f.id === value.flow_id);
  // Tanpa alur yang bisa dipakai dan tanpa pilihan lama: tidak perlu ditampilkan
  if (!Flows || (!usable.length && !value.flow_id)) return null;

  return (
    <div className="space-y-3">
      <Select
        label="Alur aplikasi"
        value={value.flow_id}
        onChange={(e) => onChange({ flow_id: e.target.value, flow_values: {} })}
        helperText={
          selected
            ? selected.trusted_submit
              ? "Dikirim tanpa persetujuan, kecuali hasilnya berisi buatan role."
              : "Sesudah pekerjaan selesai, aplikasi dibuka dan menunggu persetujuan sebelum mengirim."
            : "Opsional. Dijalankan sesudah pekerjaan role selesai."
        }
      >
        <option value="">Tanpa alur</option>
        {value.flow_id && !selected && <option value={value.flow_id}>Alur terpilih tidak bisa dipakai lagi</option>}
        {usable.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} · {f.account_name}
          </option>
        ))}
      </Select>
      {selected && selected.inputs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {selected.inputs.map((input) => (
            <Input
              key={input.key}
              label={input.label}
              maxLength={2000}
              placeholder="Kosongkan agar diisi role"
              value={value.flow_values[input.key] ?? ""}
              onChange={(e) => onChange({ ...value, flow_values: { ...value.flow_values, [input.key]: e.target.value } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
