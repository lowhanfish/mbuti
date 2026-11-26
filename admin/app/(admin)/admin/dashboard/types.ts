import type { MonthUsage } from "../pengaturan/batas-biaya/types";
import type { AgentStatus } from "../role/types";
import type { AgentRef, TaskStatus } from "../tugas/types";

export interface BusyAgent {
  agent: AgentRef;
  step_count: number;
  cost: number;
}

export interface DailyCost {
  /** Format YYYY-MM-DD */
  date: string;
  cost: number;
}

export interface ResponseInterface {
  tasks: Record<TaskStatus, number>;
  agents: Record<AgentStatus, number>;
  /** Permintaan persetujuan yang boleh diputuskan pengguna ini */
  pending_approval_count: number;
  budget: MonthUsage & { limit: number };
  /** 7 hari terakhir, urut dari yang terlama; hari tanpa biaya bernilai 0 */
  daily_costs: DailyCost[];
  /** Maksimal 5 role dengan langkah selesai terbanyak bulan ini */
  busiest_agents: BusyAgent[];
}
