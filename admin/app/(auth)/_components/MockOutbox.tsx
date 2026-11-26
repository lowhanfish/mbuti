"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { callAPI } from "@/lib/api";
import { isMockMode } from "@/lib/transport";
import { useUrlStore } from "@/store/useUrlStore";
import type { ApiResponse } from "@/types/global";
import type { MockEmail } from "@/lib/mock/accounts";
import { Icon } from "../../(admin)/_components/admin-icons";

const POLL_MS = 2500;

const toPath = (link: string) => {
  try {
    const url = new URL(link);
    return `${url.pathname}${url.search}`;
  } catch {
    return link;
  }
};

/**
 * Kotak keluar email untuk mode data contoh. Email verifikasi, undangan, dan atur ulang kata sandi
 * tidak benar-benar dikirim; di sini tautannya bisa dibuka langsung.
 */
export function MockOutbox() {
  if (!isMockMode()) return null;
  return <Outbox />;
}

function Outbox() {
  const url = useUrlStore((state) => state.URL.APP);
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<MockEmail[]>([]);
  const [seen, setSeen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await callAPI<ApiResponse<MockEmail[]>>(`${url}/api/v1/mock/outbox`);
        if (alive) setEmails(res.data);
      } catch {
        // Data contoh selalu tersedia; abaikan kegagalan sesaat
      }
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [url]);

  const latest = emails[0]?.id ?? null;
  const unread = latest !== null && latest !== seen ? emails.findIndex((e) => e.id === seen) : 0;
  const unreadCount = unread === -1 ? emails.length : unread;

  const toggle = () => {
    setOpen((value) => !value);
    setSeen(latest);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[min(380px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-3xl bg-surface border border-line shadow-2xl p-4 space-y-3 rise">
          <div>
            <p className="text-sm font-bold text-ink">Kotak keluar (data contoh)</p>
            <p className="text-[11px] text-muted leading-relaxed">
              Email tidak benar-benar dikirim. Backend sungguhan mengirimnya ke alamat tujuan; selama pengembangan isinya ditulis ke log server.
            </p>
          </div>
          {emails.length === 0 ? (
            <p className="text-xs text-faint py-6 text-center">Belum ada email.</p>
          ) : (
            emails.map((email) => (
              <article key={email.id} className="rounded-2xl border border-line bg-canvas p-3 space-y-2">
                <div>
                  <p className="text-[11px] text-muted truncate">Untuk: {email.to}</p>
                  <p className="text-sm font-semibold text-ink">{email.subject}</p>
                </div>
                <p className="text-xs text-muted whitespace-pre-line">{email.body}</p>
                {email.link && (
                  <Link
                    href={toPath(email.link)}
                    onClick={() => setOpen(false)}
                    className="inline-flex text-xs font-semibold text-white bg-brand rounded-xl px-3 py-1.5 hover:bg-brand-strong"
                  >
                    {email.link_label ?? "Buka tautan"}
                  </Link>
                )}
                <p className="text-[10px] text-faint">{new Date(email.created_at).toLocaleString("id-ID")}</p>
              </article>
            ))
          )}
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="relative inline-flex items-center gap-2 rounded-full bg-night dark:bg-brand text-white text-xs font-semibold px-4 h-10 shadow-lg hover:bg-night-2 dark:hover:bg-brand-strong"
      >
        <Icon name="mail" size={16} />
        Kotak keluar
        {unreadCount > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-accent text-ink text-[11px] font-bold flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
