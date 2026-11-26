"use client";

import { useSearchParams } from "next/navigation";

/** Token dari tautan email (`?token=…`). */
export const useLinkToken = () => useSearchParams().get("token") ?? "";
