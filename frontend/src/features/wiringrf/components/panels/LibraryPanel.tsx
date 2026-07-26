import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { CATALOG } from "@/features/wiringrf/data/catalog";
import { CATEGORY_MAP } from "@/features/wiringrf/data/categories";
import { useProjectStore } from "@/features/wiringrf/store/useProjectStore";

function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string }>>)[name] ?? Icons.Box;
  return <C size={size} color={color} />;
}

export function LibraryPanel() {
  const [q, setQ] = useState("");
  const addNodeFromTemplate = useProjectStore((s) => s.addNodeFromTemplate);

  const groups = useMemo(() => {
    const filtered = CATALOG.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.brand.toLowerCase().includes(q.toLowerCase()) ||
        CATEGORY_MAP[p.category].label.toLowerCase().includes(q.toLowerCase()),
    );
    const map = new Map<string, typeof CATALOG>();
    for (const p of filtered) {
      const g = CATEGORY_MAP[p.category].group;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    return [...map.entries()];
  }, [q]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 p-3">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Ürün Kütüphanesi</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara..."
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {groups.map(([group, items]) => (
          <div key={group} className="mb-3">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group}</div>
            <div className="space-y-1">
              {items.map((p) => (
                <button
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/kablo-template", p.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDoubleClick={() => addNodeFromTemplate(p.id, 200, 200)}
                  className="flex w-full cursor-grab items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs hover:border-blue-300 hover:bg-blue-50 active:cursor-grabbing"
                  title={`${p.brand} ${p.model} — sürükle veya çift tıkla`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded" style={{ background: `${p.accent}1a` }}>
                    <Icon name={p.icon} color={p.accent} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700">{p.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">{p.brand}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 p-2 text-[10px] leading-snug text-slate-400">
        Sürükle-bırak veya çift tıkla ile şemaya ekle. Portlardan porta kablo çek.
      </div>
    </aside>
  );
}
