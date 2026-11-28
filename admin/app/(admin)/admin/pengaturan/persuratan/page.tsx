"use client";

import React from "react";
import { Button, Card, EmptyState, PageHeader, SkeletonCard } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { LetterheadCard, SampleCard } from "./components/FilesCard";
import FormatCard from "./components/FormatCard";
import RegisterCard from "./components/RegisterCard";
import { useResponseLetterSettings } from "./hooks/crud";

export default function PersuratanPage() {
  const { Settings, isLoading, isError, error, refetch } = useResponseLetterSettings();

  return (
    <div className="space-y-6">
      <PageHeader title="Persuratan" description="Rujukan, kop, dan nomor surat organisasi Anda. Role menyusun surat mengikutinya." />
      {isError ? (
        <Card>
          <EmptyState icon={<Icon name="settings" size={26} />} title="Persuratan gagal dimuat" description={error instanceof Error ? error.message : undefined} action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>} />
        </Card>
      ) : isLoading || !Settings ? (
        <SkeletonCard className="h-60" />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2 items-start">
            <SampleCard samples={Settings.samples} canEdit={Settings.can_edit} />
            <LetterheadCard letterheads={Settings.letterheads} canEdit={Settings.can_edit} />
          </div>
          <FormatCard formats={Settings.formats} canEdit={Settings.can_edit} />
          <RegisterCard registers={Settings.registers} canEdit={Settings.can_edit} />
        </>
      )}
    </div>
  );
}
