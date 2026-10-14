"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";
import { saveProductAction, setProductActiveAction } from "@/lib/actions/sales";
import type { ProductRow } from "@/lib/services/sales";

export type ProductFilter = "todos" | "bajo" | "servicios" | "baja";

const FIELD_CLASS = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-500";
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

type Draft = { id: string | null; name: string; kind: "PRODUCT" | "SERVICE"; price: string; cost: string; trackStock: boolean; initialStock: string; minStock: string };

const EMPTY: Draft = { id: null, name: "", kind: "PRODUCT", price: "", cost: "", trackStock: true, initialStock: "0", minStock: "0" };

const toNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

function ProductForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((current) => ({ ...current, [key]: value }));
  const tracksStock = form.kind === "PRODUCT" && form.trackStock;
  const isNew = !form.id;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveProductAction(form.id, {
        name: form.name,
        kind: form.kind,
        price: toNumber(form.price),
        cost: form.cost.trim() ? toNumber(form.cost) : null,
        trackStock: tracksStock,
        initialStock: tracksStock && isNew ? Number(form.initialStock) : 0,
        minStock: tracksStock ? Number(form.minStock) : 0,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 border-b border-slate-200 bg-slate-50/70 px-4 py-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem]">
        <div>
          <label htmlFor="producto-nombre" className={LABEL_CLASS}>Nombre</label>
          <input id="producto-nombre" value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ej: Vacuna antirrábica" className={FIELD_CLASS} />
        </div>
        <div>
          <label htmlFor="producto-tipo" className={LABEL_CLASS}>Tipo</label>
          <select id="producto-tipo" value={form.kind} onChange={(event) => set("kind", event.target.value as Draft["kind"])} className={FIELD_CLASS}>
            <option value="PRODUCT">Producto</option>
            <option value="SERVICE">Servicio</option>
          </select>
        </div>
        <div>
          <label htmlFor="producto-precio" className={LABEL_CLASS}>Precio de venta</label>
          <input id="producto-precio" inputMode="decimal" value={form.price} onChange={(event) => set("price", event.target.value)} placeholder="0,00" className={FIELD_CLASS} />
        </div>
        <div>
          <label htmlFor="producto-costo" className={LABEL_CLASS}>Costo</label>
          <input id="producto-costo" inputMode="decimal" value={form.cost} onChange={(event) => set("cost", event.target.value)} placeholder="Opcional" className={FIELD_CLASS} />
        </div>
      </div>

      {form.kind === "PRODUCT" && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.trackStock} onChange={(event) => set("trackStock", event.target.checked)} className="size-4 accent-emerald-600" />
            Controlar stock
          </label>
          {form.trackStock && (
            <>
              {isNew && (
                <div className="w-28">
                  <label htmlFor="producto-stock" className={LABEL_CLASS}>Stock inicial</label>
                  <input id="producto-stock" type="number" min={0} value={form.initialStock} onChange={(event) => set("initialStock", event.target.value)} className={FIELD_CLASS} />
                </div>
              )}
              <div className="w-28">
                <label htmlFor="producto-minimo" className={LABEL_CLASS}>Avisar con</label>
                <input id="producto-minimo" type="number" min={0} value={form.minStock} onChange={(event) => set("minStock", event.target.value)} className={FIELD_CLASS} />
              </div>
              {!isNew && <p className="pb-2 text-xs text-slate-500">El stock se cambia desde la ficha del producto.</p>}
            </>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} disabled={isPending} className="h-8 rounded-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-700">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 size={12} className="animate-spin" />}
          Guardar
        </button>
      </div>
    </form>
  );
}

function draftFromProduct(product: ProductRow): Draft {
  return {
    id: product.id,
    name: product.name,
    kind: product.kind,
    price: String(product.price).replace(".", ","),
    cost: product.cost === null ? "" : String(product.cost).replace(".", ","),
    trackStock: product.trackStock,
    initialStock: "0",
    minStock: String(product.minStock),
  };
}

const FILTER_LABELS: Record<ProductFilter, string> = { todos: "Todos", bajo: "Stock bajo", servicios: "Servicios", baja: "Dados de baja" };

export function ProductManager({ products, canEdit, initialFilter }: { products: ProductRow[]; canEdit: boolean; initialFilter: ProductFilter }) {
  const router = useRouter();
  // `"new"` = formulario de alta abierto; un id = ese producto en edición.
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProductFilter>(initialFilter);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      todos: products.filter((product) => product.active).length,
      bajo: products.filter((product) => product.active && product.lowStock).length,
      servicios: products.filter((product) => product.active && product.kind === "SERVICE").length,
      baja: products.filter((product) => !product.active).length,
    }),
    [products]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (term && !product.name.toLowerCase().includes(term)) return false;
      if (filter === "baja") return !product.active;
      if (!product.active) return false;
      if (filter === "bajo") return product.lowStock;
      if (filter === "servicios") return product.kind === "SERVICE";
      return true;
    });
  }, [products, search, filter]);

  const toggleActive = (product: ProductRow) => {
    setError(null);
    startTransition(async () => {
      const result = await setProductActiveAction(product.id, !product.active);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Productos y stock</h1>
          <p className="mt-0.5 text-sm text-slate-500">Lo que la clínica vende, con sus existencias, lotes y vencimientos.</p>
        </div>
        {canEdit && editing !== "new" && (
          <button type="button" onClick={() => setEditing("new")} className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700">
            <Plus size={15} />
            Agregar
          </button>
        )}
      </header>

      {!canEdit && <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Solo quienes administran la clínica pueden modificar el catálogo.</p>}
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {editing === "new" && <ProductForm draft={EMPTY} onDone={() => setEditing(null)} />}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Search size={15} className="text-slate-400" />
            <input
              aria-label="Buscar producto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar"
              className="h-7 w-44 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div role="tablist" aria-label="Filtrar" className="flex flex-wrap gap-1">
            {(Object.keys(FILTER_LABELS) as ProductFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium ${filter === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {FILTER_LABELS[value]}
                {value !== "todos" && counts[value] > 0 && <span className={`ml-1 tabular-nums ${filter === value ? "text-slate-300" : "text-slate-400"}`}>{counts[value]}</span>}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-400">
            {products.length === 0 ? "Todavía no cargaste productos ni servicios." : "No hay resultados para este filtro."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 text-right font-medium">Stock</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Costo</th>
                <th className="px-3 py-2 text-right font-medium">Precio</th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Margen</th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((product) =>
                editing === product.id ? (
                  <tr key={product.id}>
                    <td colSpan={canEdit ? 6 : 5} className="p-0">
                      <ProductForm draft={draftFromProduct(product)} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={product.id} className="group hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <Link href={`/ventas/productos/${product.id}`} className={`font-medium hover:text-emerald-700 ${product.active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                        {product.name}
                      </Link>
                      {product.kind === "SERVICE" && <span className="ml-2 text-xs text-slate-400">Servicio</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {product.trackStock ? (
                        <span className={product.lowStock ? "rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800" : "text-slate-700"}>{product.stock}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">{product.cost === null ? "—" : money.format(product.cost)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money.format(product.price)}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-500 md:table-cell">{product.margin === null ? "—" : `${Math.round(product.margin * 100)}%`}</td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-3 whitespace-nowrap text-xs font-medium text-slate-500 opacity-60 transition-opacity group-hover:opacity-100">
                          <button type="button" onClick={() => setEditing(product.id)} aria-label={`Editar ${product.name}`} className="hover:text-slate-900">
                            Editar
                          </button>
                          <button type="button" onClick={() => toggleActive(product)} disabled={isPending} className="hover:text-slate-900 disabled:opacity-50">
                            {product.active ? "Dar de baja" : "Reactivar"}
                          </button>
                        </span>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
