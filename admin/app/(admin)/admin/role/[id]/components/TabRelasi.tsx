"use client";

import Link from "next/link";
import React from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { buttonClasses } from "../../../../_components/ui/button-classes";
import { useResponseGraph } from "../../../relasi/hooks/crud";
import { PAYLOAD_LABEL, RELATION_STYLE, triggerLabel, type RelationInterface } from "../../../relasi/types";
import type { ResponseInterface } from "../../types";

function RelationCard({
  r,
  otherName,
  direction,
  revisionLimit,
}: {
  r: RelationInterface;
  otherName: string;
  direction: "in" | "out";
  revisionLimit: number;
}) {
  const style = RELATION_STYLE[r.relation_type];
  return (
    <li className="relative rounded-2xl bg-white border border-line p-4 pl-5 overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: style.color }} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: style.color }}>
          <Icon name={style.icon} size={12} />
          {style.label}
        </span>
        <span className="text-sm font-semibold text-ink">
          {direction === "out" ? "→" : "←"} {otherName}
        </span>
        {r.label && <span className="text-xs text-muted">“{r.label}”</span>}
      </div>
      {r.expected_output && <p className="text-xs text-muted mt-2 leading-relaxed">{r.expected_output}</p>}
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <Badge size="sm">{triggerLabel(r.relation_type, r.trigger)}</Badge>
        <Badge size="sm">{PAYLOAD_LABEL[r.payload_spec]}</Badge>
        {r.relation_type === "review" && (
          <Badge size="sm" variant="accent">
            Maks {Math.min(r.max_revisions, revisionLimit)}× revisi
          </Badge>
        )}
        {r.requires_approval && (
          <Badge size="sm" variant="danger">
            Perlu persetujuan manusia
          </Badge>
        )}
      </div>
      {r.trigger === "on_condition" && r.condition && <p className="text-[11px] text-faint mt-2">Kondisi: {r.condition}</p>}
    </li>
  );
}

export default function TabRelasi({ role }: { role: ResponseInterface }) {
  const { Graph, isLoading } = useResponseGraph();
  if (isLoading || !Graph) return <Skeleton className="h-64 rounded-3xl" />;

  const name = (id: string) => Graph.nodes.find((n) => n.id === id)?.name ?? id;
  const outgoing = Graph.relations.filter((r) => r.source_id === role.id);
  const incoming = Graph.relations.filter((r) => r.target_id === role.id);

  if (!outgoing.length && !incoming.length) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="flow" size={26} />}
          title={`${role.name} belum terhubung dengan siapa pun`}
          description="Hubungkan di Peta Relasi: siapa yang memeriksa hasilnya, ke mana hasil diserahkan, dan kapan manusia memutuskan."
          action={
            <Link href="/admin/relasi" className={buttonClasses("primary", "md")}>
              Buka Peta Relasi
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(
        [
          ["Relasi keluar dari " + role.name, outgoing, "out"],
          ["Menerima pekerjaan dari", incoming, "in"],
        ] as const
      ).map(([title, list, dir]) => (
        <Card key={dir}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <Badge size="sm">{list.length}</Badge>
          </CardHeader>
          <CardContent>
            {list.length ? (
              <ul className="space-y-2.5 stagger">
                {list.map((r) => (
                  <RelationCard key={r.id} r={r} revisionLimit={Graph.revision_limit} direction={dir} otherName={name(dir === "out" ? r.target_id : r.source_id)} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">Tidak ada.</p>
            )}
          </CardContent>
        </Card>
      ))}
      <div className="lg:col-span-2 text-right">
        <Link href="/admin/relasi" className="text-sm font-semibold text-brand hover:underline">
          Atur di Peta Relasi →
        </Link>
      </div>
    </div>
  );
}
