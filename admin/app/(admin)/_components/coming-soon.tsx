import { Badge, Card, EmptyState, PageHeader } from "./ui";
import { Icon } from "./admin-icons";

/** Halaman sementara untuk menu yang dibangun pada tahap berikutnya (lihat PLANNING.md bagian 11). */
export function ComingSoon({
  title,
  stage,
  icon,
  description,
  items,
}: {
  title: string;
  stage: string;
  icon: string;
  description: string;
  items: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} badge={<Badge variant="info">Tahap {stage}</Badge>} />
      <Card>
        <EmptyState
          icon={<Icon name={icon} size={26} />}
          title="Halaman ini sedang disiapkan"
          description={`Dibangun pada tahap ${stage}. Rencana isinya:`}
          action={
            <ul className="text-sm text-muted text-left list-disc pl-5 space-y-1 max-w-md">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          }
        />
      </Card>
    </div>
  );
}
