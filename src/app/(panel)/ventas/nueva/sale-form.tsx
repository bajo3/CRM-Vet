"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { createSaleAction } from "@/lib/actions/sales";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";
import type { ProductRow } from "@/lib/services/sales";
import type { PendingUsageLine } from "@/lib/services/pending-charges";

/** `usageMovementIds`: producto ya usado en una consulta (pendiente de cobro), cantidad fija. */
type Line = { key: number; productId: string | null; description: string; unitPrice: number; quantity: number; usageMovementIds?: string[] };

const FIELD_CLASS = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500";
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function SaleForm({
  products,
  pets,
  initialPetId,
  pendingUsages,
  pendingAppointments,
}: {
  products: ProductRow[];
  pets: { id: string; label: string }[];
  initialPetId: string;
  pendingUsages: PendingUsageLine[];
  pendingAppointments: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lines, setLines] = useState<Line[]>(() =>
    pendingUsages.map((usage, index) => ({
      key: index + 1,
      productId: usage.productId,
      description: usage.productName,
      unitPrice: usage.unitPrice,
      quantity: usage.quantity,
      usageMovementIds: usage.movementIds,
    }))
  );
  const [nextKey, setNextKey] = useState(pendingUsages.length + 1);
  const [appointmentIds, setAppointmentIds] = useState(pendingAppointments.map((row) => row.id));
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDescription, setManualDescription] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [petId, setPetId] = useState(initialPetId);
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // El total que se muestra es orientativo: el servidor lo recalcula con los precios del catálogo.
  const total = lines.reduce((sum, line) => sum + Math.round(line.unitPrice * 100) * line.quantity, 0) / 100;

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? products.filter((product) => product.name.toLowerCase().includes(term)) : products;
  }, [products, search]);

  const addLine = (line: Omit<Line, "key">) => {
    setLines((current) => [...current, { ...line, key: nextKey }]);
    setNextKey((key) => key + 1);
    setError(null);
  };

  const addProduct = (product: ProductRow) => {
    const inCart = lines.filter((line) => line.productId === product.id && !line.usageMovementIds).reduce((sum, line) => sum + line.quantity, 0);
    if (product.trackStock && inCart >= product.stock) {
      setError(`Solo quedan ${product.stock} de ${product.name}.`);
      return;
    }
    const existing = lines.find((line) => line.productId === product.id && !line.usageMovementIds);
    if (existing) {
      setLines((current) => current.map((line) => (line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line)));
    } else {
      addLine({ productId: product.id, description: product.name, unitPrice: product.price, quantity: 1 });
    }
    setError(null);
  };

  const addManual = () => {
    const price = Number(manualPrice.replace(/\./g, "").replace(",", "."));
    if (!manualDescription.trim() || !(price > 0)) {
      setError("Para un ítem libre, completá la descripción y un importe mayor a cero.");
      return;
    }
    addLine({ productId: null, description: manualDescription.trim(), unitPrice: price, quantity: 1 });
    setManualDescription("");
    setManualPrice("");
  };

  const changeQuantity = (key: number, delta: number) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, quantity: Math.max(1, line.quantity + delta) } : line)));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (lines.length === 0) {
      setError("Agregá al menos un ítem.");
      return;
    }
    if (paymentMethod === "ACCOUNT" && !petId) {
      setError("Para vender a cuenta corriente elegí la mascota, así queda en la cuenta de su dueño/a.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createSaleAction({
        petId,
        paymentMethod,
        notes,
        items: lines.map((line) =>
          line.usageMovementIds
            ? { usageMovementIds: line.usageMovementIds }
            : line.productId
              ? { productId: line.productId, quantity: line.quantity }
              : { description: line.description, unitPrice: line.unitPrice, quantity: line.quantity }
        ),
        appointmentIds,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/ventas?ok=${encodeURIComponent("Venta registrada.")}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" noValidate>
      {/* Catálogo */}
      <div className="space-y-4">
        {pendingAppointments.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-950">
              <CalendarCheck size={15} />
              Turnos atendidos que se cierran con este cobro
            </p>
            <ul className="mt-2 space-y-1.5">
              {pendingAppointments.map((row) => (
                <li key={row.id}>
                  <label className="flex items-center gap-2 text-sm text-amber-950">
                    <input
                      type="checkbox"
                      checked={appointmentIds.includes(row.id)}
                      onChange={(event) => setAppointmentIds((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))}
                      className="size-4 accent-brand-600"
                    />
                    {row.label}
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-900/80">Sumá la consulta u otros servicios con su precio.</p>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
            <Search size={15} className="shrink-0 text-slate-400" />
            <input
              aria-label="Buscar producto o servicio"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto o servicio"
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          {products.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Todavía no cargaste productos.{" "}
              <Link href="/ventas/productos" className="font-medium text-brand-700 hover:underline">
                Cargar catálogo
              </Link>
              , o usá un ítem libre.
            </p>
          ) : visibleProducts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Ningún producto coincide con la búsqueda.</p>
          ) : (
            <ul className="grid gap-px bg-slate-100 sm:grid-cols-2">
              {visibleProducts.map((product) => {
                const outOfStock = product.trackStock && product.stock === 0;
                return (
                  <li key={product.id} className="bg-white">
                    <button
                      type="button"
                      onClick={() => addProduct(product)}
                      disabled={outOfStock}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{product.name}</span>
                        <span className={`block text-xs ${product.lowStock ? "text-amber-700" : "text-slate-500"}`}>
                          {product.kind === "SERVICE" ? "Servicio" : product.trackStock ? (outOfStock ? "Sin stock" : `Stock ${product.stock}`) : "Producto"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{money.format(product.price)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <button type="button" onClick={() => setManualOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700">
            Ítem libre
            <Plus size={15} className={`text-slate-400 transition-transform ${manualOpen ? "rotate-45" : ""}`} />
          </button>
          {manualOpen && (
            <div className="flex flex-col gap-2 border-t border-slate-100 p-3 sm:flex-row">
              <input aria-label="Descripción del ítem libre" placeholder="Descripción" value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} className={FIELD_CLASS} />
              <input aria-label="Importe del ítem libre" inputMode="decimal" placeholder="Importe" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} className={`${FIELD_CLASS} sm:w-32`} />
              <button type="button" onClick={addManual} className="h-9 shrink-0 rounded-lg bg-slate-800 px-4 text-sm font-medium text-white">
                Agregar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Resumen */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className="rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Resumen</h2>
          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Elegí productos o servicios de la izquierda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lines.map((line) => (
                <li key={line.key} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm font-medium text-slate-800">
                      {line.description}
                      {line.usageMovementIds && <span className="ml-1.5 text-xs font-normal text-slate-500">usado en consulta</span>}
                    </span>
                    <button
                      type="button"
                      aria-label={`Quitar ${line.description}`}
                      onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                      className="shrink-0 text-slate-300 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    {line.usageMovementIds ? (
                      <span className="text-xs text-slate-500 tabular-nums">
                        {line.quantity} × {money.format(line.unitPrice)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <button type="button" aria-label={`Menos ${line.description}`} onClick={() => changeQuantity(line.key, -1)} className="grid size-6 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">
                          <Minus size={12} />
                        </button>
                        <span aria-label={`Cantidad de ${line.description}`} className="w-7 text-center text-sm tabular-nums">
                          {line.quantity}
                        </span>
                        <button type="button" aria-label={`Más ${line.description}`} onClick={() => changeQuantity(line.key, 1)} className="grid size-6 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">
                          <Plus size={12} />
                        </button>
                        <span className="ml-1 text-xs text-slate-500 tabular-nums">× {money.format(line.unitPrice)}</span>
                      </span>
                    )}
                    <span className="text-sm font-semibold tabular-nums">{money.format((Math.round(line.unitPrice * 100) * line.quantity) / 100)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 border-t border-slate-100 px-4 py-3">
            <div>
              <label htmlFor="venta-mascota" className="mb-1 block text-xs font-medium text-slate-500">
                Mascota
              </label>
              <select id="venta-mascota" value={petId} onChange={(event) => setPetId(event.target.value)} className={FIELD_CLASS}>
                <option value="">Venta de mostrador</option>
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Medio de pago</p>
              <div role="radiogroup" aria-label="Medio de pago" className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === method}
                    onClick={() => setPaymentMethod(method)}
                    className={`h-8 rounded-lg border px-2.5 text-xs font-medium ${
                      paymentMethod === method ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[method]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="venta-notas" className="mb-1 block text-xs font-medium text-slate-500">
                Nota (opcional)
              </label>
              <input id="venta-notas" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className={FIELD_CLASS} />
            </div>
          </div>

          <div className="flex items-baseline justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{money.format(total)}</span>
          </div>
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex gap-2">
          <Link href="/ventas" className="flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </Link>
          <button type="submit" disabled={isPending} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 text-sm font-semibold text-white disabled:opacity-60">
            {isPending && <Loader2 size={15} className="animate-spin" />}
            Cobrar {money.format(total)}
          </button>
        </div>
      </aside>
    </form>
  );
}
