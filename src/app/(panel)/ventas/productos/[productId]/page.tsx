import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES, CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getProductStock, movementLabel } from "@/lib/services/stock";
import { formatDateShort, formatMoney } from "@/lib/format";
import { StockForms } from "./stock-forms";

const EXPIRY_BADGE = {
  expired: { label: "Vencido", className: "bg-rose-100 text-rose-700" },
  soon: { label: "Por vencer", className: "bg-amber-100 text-amber-800" },
} as const;

export default async function ProductStockPage({ params }: { params: Promise<{ productId: string }> }) {
  const session = await requireSession();
  const { productId } = await params;
  const [detail, clinic] = await Promise.all([getProductStock(session.clinicId, productId), getClinicSettings(session.clinicId)]);
  if (!detail) notFound();
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const { product, lots, movements } = detail;
  const margin = product.cost !== null && product.price > 0 ? (product.price - product.cost) / product.price : null;
  const isLow = product.trackStock && product.stock <= product.minStock;

  const facts = [
    { label: "Precio de venta", value: formatMoney(product.price) },
    { label: "Costo", value: product.cost === null ? "—" : formatMoney(product.cost) },
    { label: "Margen", value: margin === null ? "—" : `${Math.round(margin * 100)}%` },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <Link href="/ventas/productos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft size={15} />
        Productos y stock
      </Link>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{product.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{product.kind === "SERVICE" ? "Servicio" : "Producto"}{!product.active && " · dado de baja"}</p>
        </div>
      </header>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white">
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          <div className="px-4 py-3.5">
            <dt className="text-xs font-medium text-slate-500">Stock actual</dt>
            <dd className={`mt-1 text-xl font-semibold tabular-nums ${isLow ? "text-amber-700" : ""}`}>{product.trackStock ? product.stock : "—"}</dd>
            <p className="mt-0.5 text-xs text-slate-400">{product.trackStock ? `Aviso con ${product.minStock} o menos` : "Sin control de stock"}</p>
          </div>
          {facts.map((fact, index) => (
            <div key={fact.label} className={`border-l border-slate-100 px-4 py-3.5 ${index >= 1 ? "" : ""}`}>
              <dt className="text-xs font-medium text-slate-500">{fact.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {product.kind === "SERVICE" ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">Los servicios no tienen stock.</p>
      ) : (
        <>
          <StockForms
            productId={product.id}
            currentStock={product.stock}
            tracksStock={product.trackStock}
            canPurchase={hasRole(session, CLIENT_MANAGE_ROLES)}
            canAdjust={hasRole(session, CLINIC_CONFIG_ROLES)}
          />

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <section className="rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Lotes</h2>
              {lots.length === 0 ? (
                <p className="px-4 py-5 text-xs leading-5 text-slate-400">Sin lotes. Al ingresar mercadería podés cargar número de lote y vencimiento.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {lots.map((lot) => {
                    const badge = lot.expiry === "expired" || lot.expiry === "soon" ? EXPIRY_BADGE[lot.expiry] : null;
                    return (
                      <li key={lot.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800">{lot.lotNumber ? `Lote ${lot.lotNumber}` : "Sin lote"}</span>
                          <span className="block text-xs text-slate-500">
                            {lot.expiresAt ? `Vence ${formatDateShort(lot.expiresAt, timezone)}` : "Sin vencimiento"}
                            {badge && <span className={`ml-1.5 rounded px-1.5 py-0.5 font-medium ${badge.className}`}>{badge.label}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{lot.quantity}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Movimientos</h2>
              {movements.length === 0 ? (
                <p className="px-4 py-5 text-xs text-slate-400">Todavía no hay movimientos.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {movements.map((movement) => (
                    <li key={movement.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2.5 text-sm">
                      <span className="pt-0.5 text-xs tabular-nums text-slate-400">{formatDateShort(movement.createdAt, timezone)}</span>
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-700">{movementLabel(movement.type)}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[
                            movement.pet?.name,
                            movement.lot?.lotNumber && `Lote ${movement.lot.lotNumber}`,
                            movement.supplier,
                            movement.unitCost !== null && `${formatMoney(movement.unitCost)} c/u`,
                            movement.note,
                            movement.user?.name,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className={`font-semibold tabular-nums ${movement.quantity > 0 ? "text-brand-700" : "text-slate-700"}`}>
                        {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
