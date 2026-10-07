"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createSaleAction } from "@/lib/actions/sales";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/validation/sales";
import type { ProductRow } from "@/lib/services/sales";

type Line = { key: number; productId: string | null; description: string; unitPrice: number; quantity: number };

const INPUT_CLASS = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400";
const LABEL_CLASS = "mb-1.5 block text-sm font-medium text-slate-700";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function SaleForm({ products, pets, initialPetId }: { products: ProductRow[]; pets: { id: string; label: string }[]; initialPetId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lines, setLines] = useState<Line[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [productId, setProductId] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [petId, setPetId] = useState(initialPetId);
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // El total que se muestra es orientativo: el servidor lo recalcula con los precios del catálogo.
  const total = lines.reduce((sum, line) => sum + Math.round(line.unitPrice * 100) * line.quantity, 0) / 100;

  const addLine = (line: Omit<Line, "key">) => {
    setLines((current) => [...current, { ...line, key: nextKey }]);
    setNextKey((key) => key + 1);
    setError(null);
  };

  const addProduct = () => {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    const existing = lines.find((line) => line.productId === product.id);
    if (existing) {
      setLines((current) => current.map((line) => (line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line)));
    } else {
      addLine({ productId: product.id, description: product.name, unitPrice: product.price, quantity: 1 });
    }
    setProductId("");
  };

  const addManual = () => {
    const price = Number(manualPrice.replace(",", "."));
    if (!manualDescription.trim() || !(price > 0)) {
      setError("Para un ítem a mano, completá la descripción y un importe mayor a cero.");
      return;
    }
    addLine({ productId: null, description: manualDescription.trim(), unitPrice: price, quantity: 1 });
    setManualDescription("");
    setManualPrice("");
  };

  const setQuantity = (key: number, value: string) => {
    const quantity = Math.max(1, Math.floor(Number(value)) || 1);
    setLines((current) => current.map((line) => (line.key === key ? { ...line, quantity } : line)));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (lines.length === 0) {
      setError("Agregá al menos un ítem.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createSaleAction({
        petId,
        paymentMethod,
        notes,
        items: lines.map((line) =>
          line.productId ? { productId: line.productId, quantity: line.quantity } : { description: line.description, unitPrice: line.unitPrice, quantity: line.quantity }
        ),
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
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Qué se cobra</h2>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select aria-label="Producto o servicio" value={productId} onChange={(event) => setProductId(event.target.value)} className={INPUT_CLASS}>
            <option value="">{products.length === 0 ? "Todavía no cargaste productos ni servicios" : "Elegí un producto o servicio"}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id} disabled={product.trackStock && product.stock === 0}>
                {product.name} — {money.format(product.price)}
                {product.trackStock ? ` (stock: ${product.stock})` : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={addProduct} disabled={!productId} className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-4 text-sm font-medium text-white disabled:opacity-40">
            <Plus size={16} />
            Agregar
          </button>
        </div>
        {products.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Podés cargar tu catálogo en{" "}
            <Link href="/ventas/productos" className="font-medium text-emerald-700 hover:underline">
              Productos y servicios
            </Link>
            , o agregar un ítem a mano acá abajo.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input aria-label="Descripción del ítem a mano" placeholder="Otro ítem (a mano)" value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} className={INPUT_CLASS} />
          <input aria-label="Importe del ítem a mano" inputMode="decimal" placeholder="Importe" value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} className={`${INPUT_CLASS} sm:w-36`} />
          <button type="button" onClick={addManual} className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Plus size={16} />
            Agregar
          </button>
        </div>

        {lines.length > 0 && (
          <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{line.description}</span>
                  <span className="block text-xs text-slate-500">{money.format(line.unitPrice)} c/u</span>
                </span>
                <input
                  aria-label={`Cantidad de ${line.description}`}
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(event) => setQuantity(line.key, event.target.value)}
                  className="h-9 w-16 rounded-lg border border-slate-200 px-2 text-center text-sm outline-none focus:border-emerald-400"
                />
                <span className="w-28 shrink-0 text-right font-semibold">{money.format((Math.round(line.unitPrice * 100) * line.quantity) / 100)}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${line.description}`}
                  onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
          <span className="text-sm font-medium text-slate-600">Total</span>
          <span className="text-2xl font-semibold tracking-tight">{money.format(total)}</span>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className={LABEL_CLASS}>Medio de pago</p>
          <div role="radiogroup" aria-label="Medio de pago" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                role="radio"
                aria-checked={paymentMethod === method}
                onClick={() => setPaymentMethod(method)}
                className={`h-10 rounded-xl border text-sm font-medium ${
                  paymentMethod === method ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-700 hover:border-emerald-300"
                }`}
              >
                {PAYMENT_METHOD_LABELS[method]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="venta-mascota" className={LABEL_CLASS}>Mascota (opcional)</label>
          <select id="venta-mascota" value={petId} onChange={(event) => setPetId(event.target.value)} className={INPUT_CLASS}>
            <option value="">Venta de mostrador, sin mascota</option>
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="venta-notas" className={LABEL_CLASS}>Notas (opcional)</label>
          <input id="venta-notas" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className={INPUT_CLASS} />
        </div>
      </section>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Link href="/ventas" className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Cancelar
        </Link>
        <button type="submit" disabled={isPending} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm shadow-emerald-200 disabled:opacity-60">
          {isPending && <Loader2 size={16} className="animate-spin" />}
          Cobrar {money.format(total)}
        </button>
      </div>
    </form>
  );
}
