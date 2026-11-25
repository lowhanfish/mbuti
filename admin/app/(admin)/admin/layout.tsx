"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { Suspense, useEffect, useState } from "react";
import { adminMenu, findPageTitle, isItemActive, type MenuItem } from "../_data/admin-menu";
import { Icon } from "../_components/admin-icons";
import { BackgroundOrbs, BrandMark } from "../_components/brand-mark";
import { useAuthStore } from "@/store/useAuthStore";
import { isMockMode } from "@/lib/transport";
import { ACCESS_ROLE_LABEL } from "@/utilities/labels";

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
      ? `group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] transition-all duration-200 cursor-pointer select-none text-left ${
          isExactActive
            ? "text-white font-semibold bg-gradient-to-r from-brand to-[#9b6bff] shadow-[0_10px_22px_-10px_rgba(124,77,255,.9)]"
            : isActive
              ? "text-brand font-semibold bg-brand-soft/70"
              : "text-muted font-medium hover:bg-white hover:text-ink"
        }`
      : `w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none text-left ${
          isExactActive ? "bg-white text-brand font-semibold shadow-sm" : "text-muted font-medium hover:bg-white/80 hover:text-brand"
        }`;

  const innerContent = (
    <>
      {level === 1 ? (
        <span
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
            isExactActive ? "bg-white/20" : "bg-white/70 group-hover:bg-brand-soft group-hover:text-brand"
          }`}
        >
          <Icon name={item.icon} size={17} />
        </span>
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isExactActive ? "bg-accent" : "bg-line"}`} />
      )}
      <span className="flex-1 truncate leading-normal">{item.title}</span>
      {hasChildren && (
        <Icon name="chevron" size={14} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      )}
    </>
  );

  if (hasChildren && item.children) {
    return (
      <div className="space-y-1">
        <button type="button" onClick={() => toggleMenu(menuKey)} className={baseClass} aria-expanded={isOpen}>
          {innerContent}
        </button>
        {isOpen && (
          <div className="space-y-1 pt-0.5 pb-1 ml-7 pl-3 border-l-2 border-brand-soft rise">
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
    <Link href={item.path ?? "#"} onClick={onItemClick} className={baseClass} aria-current={isExactActive ? "page" : undefined}>
      {innerContent}
    </Link>
  );
}

/*
 * usePathname() adalah data saat permintaan. Dengan Cache Components, bagian yang membacanya
 * harus berada di dalam <Suspense> agar kerangka layout tetap bisa diprerender (termasuk rute dinamis).
 */
function SidebarNav({ onItemClick }: { onItemClick: () => void }) {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const toggleMenu = (key: string) => {
    setOpenMenus((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));
  };
  return (
    <>
      {adminMenu.map((item) => (
        <MenuItemRenderer
          key={item.title}
          item={item}
          pathname={pathname}
          openMenus={openMenus}
          toggleMenu={toggleMenu}
          onItemClick={onItemClick}
        />
      ))}
    </>
  );
}

function HeaderTitle() {
  const pathname = usePathname();
  const pageTitle = findPageTitle(adminMenu, pathname) ?? "Dashboard";
  return (
    <div className="flex flex-col min-w-0">
      <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-faint">
        <Link href="/admin" className="hover:text-brand">
          MBUTI
        </Link>
        <span>/</span>
        <span className="text-muted">{pageTitle}</span>
      </div>
      <h1 className="text-base sm:text-lg font-bold text-ink tracking-tight truncate">{pageTitle}</h1>
    </div>
  );
}

function NavFallback() {
  return (
    <div className="space-y-2 px-1" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="h-11 rounded-2xl bg-white/50 motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    checkAuth().then((currentUser) => {
      if (!currentUser) router.replace("/login");
    });
  }, [checkAuth, router]);

  // Kerangka dan {children} selalu dirender (syarat instant navigation Next.js 16).
  // Selama sesi diperiksa, isi ditutup lapisan pemuat. Hak akses tetap ditegakkan backend.
  const ready = !isLoading && Boolean(user);

  return (
    <div className="admin-shell min-h-screen flex flex-col antialiased">
      <BackgroundOrbs />

      {!ready && (
        <div className="admin-shell fixed inset-0 z-[60] flex items-center justify-center">
          <BackgroundOrbs />
          <div className="flex flex-col items-center gap-4 text-muted text-sm" role="status">
            <BrandMark size={64} className="animate-float" />
            <span>Memeriksa sesi…</span>
          </div>
        </div>
      )}

      {sidebarOpen && (
        <div className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`glass fixed top-3 bottom-3 left-3 z-50 w-[268px] rounded-[28px] flex flex-col transition-transform duration-300 ease-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-[110%] lg:translate-x-0"
        }`}
        aria-label="Navigasi utama"
      >
        <div className="h-[76px] flex items-center justify-between px-4 shrink-0">
          <Link href="/admin" className="flex items-center gap-3 flex-1 min-w-0 px-1">
            <BrandMark size={42} />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-extrabold text-[15px] tracking-wide text-ink">
                MBUTI<span className="text-accent-strong">.</span>
              </span>
              <span className="text-[11px] text-faint truncate">{user?.organization?.name ?? "Belum ada organisasi"}</span>
            </div>
          </Link>
          <button
            type="button"
            className="lg:hidden w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:bg-white"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup menu"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Menu utama</div>
          <Suspense fallback={<NavFallback />}>
            <SidebarNav onItemClick={() => setSidebarOpen(false)} />
          </Suspense>
        </nav>

        <div className="p-3 shrink-0">
          <div className="rounded-2xl p-3 bg-gradient-to-br from-ink to-[#2d2150] text-white relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full bg-accent/30 blur-xl" aria-hidden="true" />
            <div className="flex items-center gap-2.5 relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-strong text-ink font-bold text-sm flex items-center justify-center uppercase shrink-0">
                {(user?.full_name || user?.email || "?")[0]}
              </div>
              <div className="flex flex-col min-w-0 leading-tight flex-1">
                <span className="text-xs font-semibold truncate">{user?.full_name ?? ""}</span>
                <span className="text-[10px] text-white/60">
                  {user?.access_role ? ACCESS_ROLE_LABEL[user.access_role] : "Tanpa akses"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Keluar"
                title="Keluar"
              >
                <Icon name="logout" size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 lg:pl-[308px] flex flex-col min-w-0 px-3 lg:pr-7">
        <header className="glass sticky top-3 z-30 mt-3 h-16 rounded-[22px] px-4 sm:px-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-muted hover:text-brand transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
            >
              <Icon name="menu" size={18} />
            </button>
            <Suspense fallback={<div className="h-9 w-40 rounded-xl bg-white/50 motion-safe:animate-pulse" />}>
              <HeaderTitle />
            </Suspense>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isMockMode() && (
              <span
                className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-ink text-accent text-[11px] font-semibold px-3 py-1.5"
                title="Semua data di layar ini adalah data contoh di peramban, belum tersambung ke backend."
              >
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-60" />
                  <span className="relative w-2 h-2 rounded-full bg-accent" />
                </span>
                Data contoh
              </span>
            )}
            <button
              type="button"
              className="relative w-10 h-10 rounded-2xl bg-white text-muted hover:text-brand flex items-center justify-center transition-colors"
              aria-label="Notifikasi"
            >
              <Icon name="bell" size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 py-6 space-y-6 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
