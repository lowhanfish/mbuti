import type { UserProfile } from "@/types/global";

/** Halaman tujuan setelah masuk: organisasi yang belum disetujui menunggu dulu. */
export const landingPathFor = (user: UserProfile) =>
  user.organization?.status === "pending" || user.organization?.status === "suspended" ? "/menunggu-persetujuan" : "/admin";
