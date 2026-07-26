import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { CATALOG } from "@/features/wiringrf/data/catalog";
import { CATEGORY_MAP } from "@/features/wiringrf/data/categories";
import { useProjectStore } from "@/features/wiringrf/store/useProjectStore";
import { listKaravanProducts, getAllProductPorts, type KaravanProduct } from "@/features/wiringrf/lib/backendApi";
import type { Port } from "@/features/wiringrf/types";

function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string }>>)[name] ?? Icons.Box;
  return <C size={size} color={color} />;
}

type Tab = "catalog" | "products";

export function LibraryPanel() {
  const [tab, setTab] = useState<Tab>("catalog");
  const [q, setQ] = useState("");
  const addNodeFromTemplate = useProjectStore((s) => s.addNodeFromTemplate);
  const addProductNode = useProjectStore((s) => s.addProductNode);

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

  // ---- Karavan ürünleri ----
  const [products, setProducts] = useState<KaravanProduct[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);
  const [prodQuery, setProdQuery] = useState("");
  const [portsMap, setPortsMap] = useState<Record<string, Port[]>>({});
  const loadedOnce = useRef(false);

  const fetchProducts = useCallback((search: string) => {
    setProdLoading(true);
    setProdError(null);
    listKaravanProducts(search || undefined)
      .then((rows) => setProducts(Array.isArray(rows) ? rows : []))
      .catch((e) => setProdError(e?.message || "Ürünler yüklenemedi (giriş gerekli olabilir)."))
      .finally(() => setProdLoading(false));
  }, []);

  // Ürünler sekmesine ilk geçişte yükle.
  useEffect(() => {
    if (tab === "products" && !loadedOnce.current) {
      loadedOnce.current = true;
      fetchProducts("");
      getAllProductPorts()
        .then((m) => setPortsMap(m || {}))
        .catch(() => setPortsMap({}));
    }
  }, [tab, fetchProducts]);

  // Arama debounce.
  useEffect(() => {
    if (tab !== "products") return;
    const t = setTimeout(() => fetchProducts(prodQuery), 350);
    return () => clearTimeout(t);
  }, [prodQuery, tab, fetchProducts]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="flex border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setTab("catalog")}
          className={`flex-1 px-2 py-2 ${tab === "catalog" ? "border-b-2 border-blue-500 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
        >
          Kütüphane
        </button>
        <button
          onClick={() => setTab("products")}
          className={`flex-1 px-2 py-2 ${tab === "products" ? "border-b-2 border-blue-500 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
        >
          Karavan Ürünleri
        </button>
      </div>

      {tab === "catalog" ? (
        <>
          <div className="border-b border-slate-200 p-3">
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
        </>
      ) : (
        <>
          <div className="border-b border-slate-200 p-3">
            <input
              value={prodQuery}
              onChange={(e) => setProdQuery(e.target.value)}
              placeholder="Ürün ara..."
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {prodLoading && <div className="p-3 text-center text-xs text-slate-400">Yükleniyor…</div>}
            {prodError && <div className="p-3 text-center text-xs text-red-500">{prodError}</div>}
            {!prodLoading && !prodError && products.length === 0 && (
              <div className="p-3 text-center text-xs text-slate-400">Ürün bulunamadı.</div>
            )}
            <div className="space-y-1">
              {products.map((p) => (
                <button
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/karavan-product",
                      JSON.stringify({ id: p.id, name: p.name, brand: p.brand, specs: p.specs, image_url: p.image_url, ports: portsMap[p.id] }),
                    );
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDoubleClick={() => addProductNode({ ...p, ports: portsMap[p.id] }, 200, 200)}
                  className="flex w-full cursor-grab items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs hover:border-blue-300 hover:bg-blue-50 active:cursor-grabbing"
                  title={`${p.brand ?? ""} ${p.name} — sürükle veya çift tıkla`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded bg-slate-100">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-contain" draggable={false} />
                    ) : (
                      <Icons.Package size={16} color="#94a3b8" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700">{p.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">{p.brand || "—"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="border-t border-slate-200 p-2 text-[10px] leading-snug text-slate-400">
        Sürükle-bırak veya çift tıkla ile şemaya ekle. Karavan ürünü görseliyle gelir; portlarını cihaza tıklayıp düzenle.
      </div>
    </aside>
  );
}
