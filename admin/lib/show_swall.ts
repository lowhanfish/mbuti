"use client";

import Swal, { SweetAlertIcon } from "sweetalert2";

export const showLoadingAlert = (title: string = "Memproses data...") => {
  if (typeof window === "undefined") return;
  Swal.fire({
    title,
    text: "Mohon tunggu sebentar",
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
};

export const swallAlert = (text: string, icon: SweetAlertIcon = "success") => {
  if (typeof window === "undefined") return;
  Swal.fire({
    title: icon === "success" ? "Berhasil!" : "Pemberitahuan!",
    text: `Data ${text}${/[.!?]$/.test(text) ? "" : "."}`,
    icon,
    timer: 1500,
    showConfirmButton: false,
    backdrop: false,
  });
};

/** Konfirmasi sebelum aksi yang tidak bisa dibatalkan, mis. hapus. */
export const confirmAlert = async (title: string, text: string, confirmText = "Ya, lanjutkan") => {
  if (typeof window === "undefined") return false;
  const result = await Swal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Batal",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
};
