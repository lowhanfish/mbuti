import menuData from "./admin-menu.json";

export type MenuItem = {
  title: string;
  path: string | null;
  /** Nama ikon dari admin-icons.tsx */
  icon: string;
  /** Halaman tetap bisa dibuka lewat URL, tetapi tidak tampil di sidebar. */
  hidden?: boolean;
  children?: MenuItem[] | null;
};

const visible = (items: MenuItem[]): MenuItem[] =>
  items
    .filter((item) => !item.hidden)
    .map((item) => (item.children ? { ...item, children: visible(item.children) } : item));

export const adminMenu: MenuItem[] = visible(menuData as MenuItem[]);

/** Halaman turunan (mis. /admin/role/abc) ikut menandai menu induknya (/admin/role). */
const matchesPath = (path: string, pathname: string) =>
  path === pathname || (path !== "/admin" && pathname.startsWith(`${path}/`));

export function isItemActive(item: MenuItem, pathname: string): boolean {
  if (item.path && matchesPath(item.path, pathname)) return true;
  return Boolean(item.children?.some((child) => isItemActive(child, pathname)));
}

export function findPageTitle(items: MenuItem[], pathname: string): string | null {
  let best: { title: string; length: number } | null = null;
  const walk = (list: MenuItem[]) => {
    for (const item of list) {
      if (item.path && matchesPath(item.path, pathname) && (!best || item.path.length > best.length)) {
        best = { title: item.title, length: item.path.length };
      }
      if (item.children) walk(item.children);
    }
  };
  walk(items);
  return (best as { title: string } | null)?.title ?? null;
}
