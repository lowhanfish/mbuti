"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { adminMenu, findPageTitle, isItemActive, type MenuItem } from "../_data/admin-menu";
import { Icon } from "../_components/admin-icons";
import { BrandMark } from "../_components/brand-mark";
import { useAuthStore } from "@/store/useAuthStore";
import { isMockMode } from "@/lib/transport";

const ACCESS_LABEL: Record<string, string> = {
  owner: "Pemilik",
  admin: "Admin",
  member: "Anggota",
  viewer: "Pemantau",
};

function MenuItemRenderer({
  item,
  level = 1,
  pathname,
  openMenus,
  toggleMenu,
  onItemClick,
}: {
  item: MenuItem;
  level?: number;
  pathname: string;
  openMenus: Record<string, boolean>;
  toggleMenu: (key: string) => void;
  onItemClick: () => void;
}) {
  const hasChildren = Boolean(item.children && item.children.length > 0);
  const isActive = isItemActive(item, pathname);
  const isExactActive = item.path === pathname;
  const menuKey = `${level}-${item.title}`;
  const isOpen = openMenus[menuKey] ?? isActive;

  const baseClass =
    level === 1
      ? `w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] transition-all duration-150 cursor-pointer select-none text-left ${
          isExactActive
            ? "bg-white text-brand font-semibold shadow-[0_4px_14px_rgba(40,52,140,.12)]"
            : isActive
              ? "text-brand font-semibold"
              : "text-muted font-medium hover:bg-white/70 hover:text-ink"
        }`
      : `w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none text-left ${
          isExactActive
            ? "bg-white text-brand font-semibold shadow-[0_2px_10px_rgba(40,52,140,.1)]"
            : "text-muted font-medium hover:bg-white/70 hover:text-brand"
        }`;

  const innerContent = (
    <>
      {level === 1 ? (
        <Icon name={item.icon} size={18} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isExactActive ? "bg-brand" : "bg-line"}`} />
      )}
      <span className="flex-1 truncate leading-normal">{item.title}</span>
      {hasChildren && (
        <Icon
          name="chevron"
          size={14}
          className={`text-faint transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      )}
    </>
  );

  if (hasChildren && item.children) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => toggleMenu(menuKey)}
          className={baseClass}
          aria-expanded={isOpen}
        >
          {innerContent}
        </button>
        {isOpen && (
          <div className="space-y-1 pt-0.5 pb-1 ml-5 pl-3 border-l border-line">
            {item.children.map((child) => (
              <MenuItemRenderer
                key={child.title}
                item={child}
                level={level + 1}
                pathname={pathname}
                openMenus={openMenus}
                toggleMenu={toggleMenu}
                onItemClick={onItemClick}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.path ?? "#"}
      onClick={onItemClick}
      className={baseClass}
      aria-current={isExactActive ? "page" : undefined}
    >
      {innerContent}
    </Link>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    checkAuth().then((currentUser) => {
      if (!currentUser) router.replace("/login");
    });
  }, [checkAuth, router]);

  const toggleMenu = (key: string) => {
    setOpenMenus((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));
  };

  const pageTitle = findPageTitle(adminMenu, pathname) ?? "Dashboard";

  // Kerangka dan {children} selalu dirender (syarat instant navigation Next.js 16).
  // Selama sesi diperiksa, isi disembunyikan di balik lapisan pemuat. Hak akses tetap ditegakkan backend.
  const ready = !isLoading && Boolean(user);

  return (
    <div className="admin-shell min-h-screen flex flex-col antialiased">
      {!ready && (
        <div className="admin-shell fixed inset-0 z-[60] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted text-sm" role="status">
            <BrandMark size={44} />
            <span>Memeriksa sesi…</span>
          </div>
        </div>
      )}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`glass fixed top-3 bottom-3 left-3 z-50 w-[268px] rounded-[24px] flex flex-col transition-transform duration-200 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-[110%] lg:translate-x-0"
        }`}
        aria-label="Navigasi utama"
      >
        <div className="h-[72px] flex items-center justify-between px-5 shrink-0">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-2xl bg-white/70 border border-white px-3 py-2 flex-1 mr-2 shadow-[0_2px_10px_rgba(40,52,140,.06)]"
          >
            <BrandMark size={32} />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-bold text-sm text-ink tracking-wide">MBUTI</span>
              <span className="text-[10px] text-faint truncate">
                {user?.organization?.name ?? "Belum ada organisasi"}
              </span>
            </div>
          </Link>
          <button
            type="button"
            className="lg:hidden w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:bg-white/70"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup menu"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-medium text-faint">Menu utama</div>
          {adminMenu.map((item) => (
            <MenuItemRenderer
              key={item.title}
              item={item}
              pathname={pathname}
              openMenus={openMenus}
              toggleMenu={toggleMenu}
              onItemClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        <div className="p-3 border-t border-white/70 space-y-1 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-medium text-muted hover:bg-white/70 transition-colors"
          >
            <Icon name="home" size={16} />
            <span>Halaman depan</span>
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-medium text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer text-left"
          >
            <Icon name="logout" size={16} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:pl-[308px] flex flex-col min-w-0 px-3 lg:pr-7">
        <header className="glass sticky top-3 z-30 mt-3 h-16 rounded-[22px] px-4 sm:px-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden w-10 h-10 rounded-2xl bg-white/75 flex items-center justify-center text-muted hover:bg-white transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
            >
              <Icon name="menu" size={18} />
            </button>
            <div className="flex flex-col min-w-0">
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-faint">
                <Link href="/admin" className="hover:text-brand">
                  MBUTI
                </Link>
                <span>/</span>
                <span className="text-muted">{pageTitle}</span>
              </div>
              <h1 className="text-base sm:text-lg font-semibold text-ink tracking-tight truncate">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isMockMode() && (
              <span
                className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-amber-800 text-[11px] font-semibold px-3 py-1"
                title="Semua data di layar ini adalah data contoh di peramban, belum tersambung ke backend."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Data contoh
              </span>
            )}
            <div className="flex items-center gap-2.5 pl-3 border-l border-white/80">
              <div className="w-10 h-10 rounded-full bg-brand text-white font-semibold text-sm flex items-center justify-center shadow-[0_4px_12px_rgba(76,91,212,.3)] uppercase">
                {(user?.full_name || user?.email || "?")[0]}
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-xs font-semibold text-ink truncate max-w-[150px]">
                  {user?.full_name ?? ""}
                </span>
                <span className="text-[10px] text-faint mt-1">
                  {user?.access_role ? ACCESS_LABEL[user.access_role] : "Tanpa akses"}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 py-6 space-y-6 w-full">{children}</main>
      </div>
    </div>
  );
}
