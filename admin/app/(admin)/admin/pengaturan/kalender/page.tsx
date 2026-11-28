"use client";

import React from "react";
import { Button, Card, EmptyState, PageHeader, SkeletonCard } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import DaysCard from "./components/DaysCard";
import ShiftCard from "./components/ShiftCard";
import WorkdayCard from "./components/WorkdayCard";
import { useResponseCalendar } from "./hooks/crud";

export default function KalenderKerjaPage() {
  const { Calendar, isLoading, isError, error, refetch } = useResponseCalendar();

  return (
    <div className="space-y-6">
      <PageHeader title="Kalender kerja" description="Hari kerja, shift, dan libur organisasi Anda. Tugas rutin mengikuti kalender ini." />
      {isError ? (
        <Card>
          <EmptyState icon={<Icon name="settings" size={26} />} title="Kalender gagal dimuat" description={error instanceof Error ? error.message : undefined} action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>} />
        </Card>
      ) : isLoading || !Calendar ? (
        <SkeletonCard className="h-60" />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2 items-start">
            <WorkdayCard workdays={Calendar.workdays} timezone={Calendar.timezone} canEdit={Calendar.can_edit} />
            <ShiftCard shifts={Calendar.shifts} workdays={Calendar.workdays} canEdit={Calendar.can_edit} />
          </div>
          <DaysCard canEdit={Calendar.can_edit} />
        </>
      )}
    </div>
  );
}
