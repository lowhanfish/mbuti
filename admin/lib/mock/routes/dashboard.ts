import type { ResponseInterface } from "@/app/(admin)/admin/dashboard/types";
import type { AgentStatus } from "@/app/(admin)/admin/role/types";
import type { TaskStatus } from "@/app/(admin)/admin/tugas/types";
import { isFailure, requireMember } from "../context";
import { ok, type MockRoute } from "../router";
import type { MockDatabase, MockMembership } from "../seed";
import { dayKey, monthUsage, settingsOf, stepsInMonth } from "../settings";
import { agentRef, canDecide } from "./tugas";

const buildSummary = (db: MockDatabase, self: MockMembership, now: number): ResponseInterface => {
  const orgId = self.organization_id;
  const tasks = db.tasks.filter((t) => t.organization_id === orgId);
  const taskIds = new Set(tasks.map((t) => t.id));

  const taskSummary: Record<TaskStatus, number> = { queued: 0, running: 0, waiting_approval: 0, completed: 0, failed: 0, cancelled: 0, stopped_budget: 0 };
  for (const t of tasks) taskSummary[t.status] += 1;
  const agentSummary: Record<AgentStatus, number> = { draft: 0, active: 0, paused: 0 };
  for (const a of db.agents) if (a.organization_id === orgId) agentSummary[a.status] += 1;

  const daily_costs = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (6 - i));
    return { date: dayKey(day.getTime()), cost: 0 };
  });
  for (const s of db.task_steps) {
    if (!taskIds.has(s.task_id) || !s.finished_at) continue;
    const bucket = daily_costs.find((d) => d.date === dayKey(s.finished_at!));
    if (bucket) bucket.cost += s.cost;
  }
  for (const c of db.llm_calls) {
    if (c.organization_id !== orgId) continue;
    const bucket = daily_costs.find((d) => d.date === dayKey(c.created_at));
    if (bucket) bucket.cost += c.cost;
  }

  const perAgent = new Map<string, { step_count: number; cost: number }>();
  for (const s of stepsInMonth(db, orgId, now)) {
    // Role yang sudah dihapus tidak ditampilkan
    if (!db.agents.some((a) => a.id === s.agent_id)) continue;
    const row = perAgent.get(s.agent_id) ?? { step_count: 0, cost: 0 };
    row.step_count += 1;
    row.cost += s.cost;
    perAgent.set(s.agent_id, row);
  }

  return {
    tasks: taskSummary,
    agents: agentSummary,
    pending_approval_count: db.approvals.filter((a) => taskIds.has(a.task_id) && a.status === "pending" && canDecide(self, a)).length,
    budget: { ...monthUsage(db, orgId, now), limit: settingsOf(db, orgId).monthly_budget },
    daily_costs,
    busiest_agents: [...perAgent.entries()]
      .sort(([, x], [, y]) => y.step_count - x.step_count || y.cost - x.cost)
      .slice(0, 5)
      .map(([id, row]) => ({ agent: agentRef(db, id), ...row })),
  };
};

export const dashboardRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/v1/admin/dashboard/summary",
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      return ok(buildSummary(ctx.db, self, Date.now()));
    },
  },
];
