"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus, SlidersHorizontal } from "lucide-react";
import { adjustStockAction, registerPurchaseAction } from "@/lib/actions/sales";

const INPUT_CLASS = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-500";
const toNumber = (value: string) => Number(value.replace(",", "."));

function PurchaseForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ quantity: "", unitCost: "", supplier: "", lotNumber: "", expiresOn: "" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await registerPurchaseAction(productId, {
        quantity: Number(form.quantity),
        unitCost: form.unitCost.trim() ? toNumber(form.unitCost) : null,
        supplier: form.supplier,
        lotNumber: form.lotNumber,
        expiresOn: form.expiresOn,
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
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" noValidate>
      <h3 className="text-sm font-semibold">Ingresar mercadería</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="compra-cantidad" className={LABEL_CLASS}>Cantidad</label>
          <input id="compra-cantidad" type="number" min={1} value={form.quantity} onChange={(event) => set("quantity", event.target.value)} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="compra-costo" className={LABEL_CLASS}>Costo unitario (opcional)</label>
          <input id="compra-costo" inputMode="decimal" value={form.unitCost} onChange={(event) => set("unitCost", event.target.value)} placeholder="0,00" className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="compra-proveedor" className={LABEL_CLASS}>Proveedor (opcional)</label>
          <input id="compra-proveedor" value={form.supplier} onChange={(event) => set("supplier", event.target.value)} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="compra-lote" className={LABEL_CLASS}>N.º de lote (opcional)</label>
          <input id="compra-lote" value={form.lotNumber} onChange={(event) => set("lotNumber", event.target.value)} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="compra-vence" className={LABEL_CLASS}>Vencimiento (opcional)</label>
          <input id="compra-vence" type="date" value={form.expiresOn} onChange={(event) => set("expiresOn", event.target.value)} className={INPUT_CLASS} />
        </div>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} disabled={isPending} className="h-8 rounded-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-700">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 size={13} className="animate-spin" />}
          Registrar ingreso
        </button>
      </div>
    </form>
  );
}

function AdjustForm({ productId, currentStock, onDone }: { productId: string; currentStock: number; onDone: () => void }) {
  const router = useRouter();
  const [newStock, setNewStock] = useState(String(currentStock));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const diff = Number(newStock) - currentStock;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await adjustStockAction(productId, { newStock: Number(newStock), note });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" noValidate>
      <h3 className="text-sm font-semibold">Ajustar stock</h3>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label htmlFor="ajuste-stock" className={LABEL_CLASS}>Stock real</label>
          <input id="ajuste-stock" type="number" min={0} value={newStock} onChange={(event) => setNewStock(event.target.value)} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="ajuste-motivo" className={LABEL_CLASS}>Motivo</label>
          <input id="ajuste-motivo" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej: conteo, rotura, vencido" className={INPUT_CLASS} />
        </div>
      </div>
      {Number.isFinite(diff) && diff !== 0 && (
        <p className="text-xs text-slate-500">
          Se registra un ajuste de <strong className="tabular-nums">{diff > 0 ? `+${diff}` : diff}</strong> unidades.
        </p>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} disabled={isPending} className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 text-xs font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 size={13} className="animate-spin" />}
          Guardar ajuste
        </button>
      </div>
    </form>
  );
}

export function StockForms({
  productId,
  currentStock,
  tracksStock,
  canPurchase,
  canAdjust,
}: {
  productId: string;
  currentStock: number;
  tracksStock: boolean;
  canPurchase: boolean;
  canAdjust: boolean;
}) {
  const [open, setOpen] = useState<"purchase" | "adjust" | null>(null);
  if (!canPurchase && !canAdjust) return null;

  return (
    <div className="space-y-3">
      {open === "purchase" && <PurchaseForm productId={productId} onDone={() => setOpen(null)} />}
      {open === "adjust" && <AdjustForm productId={productId} currentStock={currentStock} onDone={() => setOpen(null)} />}
      {open === null && (
        <div className="flex flex-wrap gap-2">
          {canPurchase && (
            <button type="button" onClick={() => setOpen("purchase")} className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700">
              <PackagePlus size={16} />
              Ingresar mercadería
            </button>
          )}
          {canAdjust && tracksStock && (
            <button type="button" onClick={() => setOpen("adjust")} className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <SlidersHorizontal size={16} />
              Ajustar stock
            </button>
          )}
        </div>
      )}
      {!tracksStock && <p className="text-xs text-slate-500">Este producto todavía no controla stock: el primer ingreso de mercadería lo activa.</p>}
    </div>
  );
}
