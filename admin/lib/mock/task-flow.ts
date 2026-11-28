/** Pemeriksaan pilihan alur pada tugas dan tugas rutin data contoh (E4c). */
import type { MockTask } from "./engine";
import { text } from "./context";
import type { MockDatabase, MockMembership } from "./seed";

export const readTaskFlow = (db: MockDatabase, self: MockMembership, agentId: string, flowId: unknown, values: unknown): MockTask["flow"] | string => {
  if (!flowId) return null;
  const flow = db.browser_flows.find((f) => f.id === flowId && f.agent_id === agentId);
  const agent = db.agents.find((a) => a.id === agentId);
  if (!flow) return "Alur yang dipilih tidak ada pada role ini.";
  const manager = ["owner", "admin"].includes(self.access_role) || (self.access_role !== "viewer" && agent?.owner_member_id === self.id);
  if (!manager) return "Hanya penanggung jawab role, pemilik, atau admin yang dapat memakai alur.";
  if (flow.status !== "approved") return "Alur belum disetujui.";
  const given = (values ?? {}) as Record<string, unknown>;
  return {
    flow_id: flow.id,
    name: flow.name,
    values: Object.fromEntries(flow.inputs.map((i) => [i.key, text(given[i.key], 2000)]).filter(([, v]) => v)),
  };
};
