import type { ResponseInterface, UnitNode } from "./types";

/** Susun daftar unit datar menjadi pohon. Unit yang induknya tidak ada di daftar (mis. hasil pencarian) jadi akar. */
export const buildTree = (items: ResponseInterface[]): UnitNode[] => {
  const ids = new Set(items.map((i) => i.id));
  const byParent = new Map<string | null, ResponseInterface[]>();
  for (const item of items) {
    const key = item.parent_id && ids.has(item.parent_id) ? item.parent_id : null;
    byParent.set(key, [...(byParent.get(key) ?? []), item]);
  }
  const build = (parent: string | null, depth: number): UnitNode[] =>
    (byParent.get(parent) ?? []).map((item) => ({ ...item, depth, children: build(item.id, depth + 1) }));
  return build(null, 0);
};

/** Ratakan pohon untuk ditampilkan sebagai daftar berindentasi. */
export const flattenTree = (nodes: UnitNode[]): UnitNode[] =>
  nodes.flatMap((node) => [node, ...flattenTree(node.children)]);

/** Id unit dan semua keturunannya; tidak boleh dipilih sebagai induk unit itu. */
export const blockedParentIds = (items: ResponseInterface[], id: string): Set<string> => {
  const blocked = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (item.parent_id && blocked.has(item.parent_id) && !blocked.has(item.id)) {
        blocked.add(item.id);
        grew = true;
      }
    }
  }
  return blocked;
};
