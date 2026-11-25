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

export function isItemActive(item: MenuItem, pathname: string): boolean {
  if (item.path && item.path === pathname) return true;
  return Boolean(item.children?.some((child) => isItemActive(child, pathname)));
}

export function findPageTitle(items: MenuItem[], pathname: string): string | null {
  for (const item of items) {
    if (item.path && item.path === pathname) return item.title;
    if (item.children) {
      const found = findPageTitle(item.children, pathname);
      if (found) return found;
    }
  }
  return null;
}
