"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Pencil, Plus } from "lucide-react";
import { saveProductAction, setProductActiveAction } from "@/lib/actions/sales";
import type { ProductRow } from "@/lib/services/sales";

const INPUT_CLASS = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-600";
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

type Draft = { id: string | null; name: string; kind: "PRODUCT" | "SERVICE"; price: string; cost: string; trackStock: boolean; initialStock: string; minStock: string };

const EMPTY: Draft = { id: null, name: "", kind: "PRODUCT", price: "", cost: "", trackStock: false, initialStock: "0", minStock: "0" };

const toNumber = (value: string) => Number(value.replace(",", "."));

export function ProductForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
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
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl bg-slate-50 p-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem_9rem]">
        <div>
          <label htmlFor="producto-nombre" className={LABEL_CLASS}>Nombre</label>
          <input id="producto-nombre" value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ej: Vacuna antirrábica" className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="producto-tipo" className={LABEL_CLASS}>Tipo</label>
          <select id="producto-tipo" value={form.kind} onChange={(event) => set("kind", event.target.value as Draft["kind"])} className={INPUT_CLASS}>
            <option value="PRODUCT">Producto</option>
            <option value="SERVICE">Servicio</option>
          </select>
        </div>
        <div>
          <label htmlFor="producto-precio" className={LABEL_CLASS}>Precio de venta</label>
          <input id="producto-precio" inputMode="decimal" value={form.price} onChange={(event) => set("price", event.target.value)} placeholder="0,00" className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="producto-costo" className={LABEL_CLASS}>Costo (opcional)</label>
          <input id="producto-costo" inputMode="decimal" value={form.cost} onChange={(event) => set("cost", event.target.value)} placeholder="0,00" className={INPUT_CLASS} />
        </div>
      </div>

      {form.kind === "PRODUCT" && (
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_9rem_9rem]">
          <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.trackStock} onChange={(event) => set("trackStock", event.target.checked)} className="size-4 accent-emerald-600" />
            Controlar stock de este producto
          </label>
          {form.trackStock && (
            <>
              {isNew ? (
                <div>
                  <label htmlFor="producto-stock" className={LABEL_CLASS}>Stock inicial</label>
                  <input id="producto-stock" type="number" min={0} value={form.initialStock} onChange={(event) => set("initialStock", event.target.value)} className={INPUT_CLASS} />
                </div>
              ) : (
                <p className="text-xs leading-5 text-slate-500">El stock se cambia desde la ficha del producto (ingreso o ajuste).</p>
              )}
              <div>
                <label htmlFor="producto-minimo" className={LABEL_CLASS}>Avisar con</label>
                <input id="producto-minimo" type="number" min={0} value={form.minStock} onChange={(event) => set("minStock", event.target.value)} className={INPUT_CLASS} />
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} disabled={isPending} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 size={13} className="animate-spin" />}
          Guardar
        </button>
      </div>
    </form>
  );
}

export function draftFromProduct(product: ProductRow): Draft {
  return {
    id: product.id,
    name: product.name,
    kind: product.kind,
    price: String(product.price),
    cost: product.cost === null ? "" : String(product.cost),
    trackStock: product.trackStock,
    initialStock: "0",
    minStock: String(product.minStock),
  };
}

export function ProductManager({ products, canEdit }: { products: ProductRow[]; canEdit: boolean }) {
  const router = useRouter();
  // `"new"` = formulario de alta abierto; un id = ese producto en edición.
  const [editing, setEditing] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    <div className="mt-6 space-y-4">
      {!canEdit && <p className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-600">Solo quienes administran la clínica pueden modificar el catálogo.</p>}
      {canEdit &&
        (editing === "new" ? (
          <ProductForm draft={EMPTY} onDone={() => setEditing(null)} />
        ) : (
          <button type="button" onClick={() => setEditing("new")} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white shadow-sm shadow-emerald-200">
            <Plus size={17} />
            Agregar producto o servicio
          </button>
        ))}
      {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {products.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">Todavía no hay productos ni servicios cargados.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {products.map((product) => (
              <li key={product.id} className="px-4 py-3 sm:px-5">
                {editing === product.id ? (
                  <ProductForm draft={draftFromProduct(product)} onDone={() => setEditing(null)} />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/ventas/productos/${product.id}`} className="group min-w-0 flex-1">
                      <p className={`flex items-center gap-1 truncate font-medium group-hover:text-emerald-700 ${product.active ? "" : "text-slate-400 line-through"}`}>
                        {product.name}
                        <ChevronRight size={15} className="shrink-0 text-slate-300 group-hover:text-emerald-600" />
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{product.kind === "SERVICE" ? "Servicio" : "Producto"}</span>
                        {product.trackStock && (
                          <span className={`rounded-full px-2 py-0.5 font-medium ${product.lowStock ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                            {product.lowStock ? `Stock bajo: ${product.stock}` : `Stock: ${product.stock}`}
                          </span>
                        )}
                        {product.margin !== null && <span className="tabular-nums">Margen {Math.round(product.margin * 100)}%</span>}
                        {!product.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-600">Dado de baja</span>}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">{money.format(product.price)}</span>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(product.id)}
                            aria-label={`Editar ${product.name}`}
                            className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(product)}
                            disabled={isPending}
                            className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {product.active ? "Dar de baja" : "Reactivar"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
