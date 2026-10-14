import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLIENT_MANAGE_ROLES, CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { getProductStock, movementLabel } from "@/lib/services/stock";
import { formatDateShort, formatMoney } from "@/lib/format";
import { StockForms } from "./stock-forms";

export default async function ProductStockPage({ params }: { params: Promise<{ productId: string }> }) {
  const session = await requireSession();
  const { productId } = await params;
  const [detail, clinic] = await Promise.all([getProductStock(session.clinicId, productId), getClinicSettings(session.clinicId)]);
  if (!detail) notFound();
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const { product, lots, movements } = detail;
  const margin = product.cost !== null && product.price > 0 ? (product.price - product.cost) / product.price : null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-5 sm:px-7 lg:py-8">
      <Link href="/ventas/productos" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} />
        Productos y servicios
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {product.kind === "SERVICE" ? "Servicio" : "Producto"} · Precio {formatMoney(product.price)}
            {product.cost !== null && ` · Costo ${formatMoney(product.cost)}`}
            {margin !== null && ` · Margen ${Math.round(margin * 100)}%`}
          </p>
        </div>
        {product.trackStock && (
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Stock actual</p>
            <p className={`text-3xl font-semibold tabular-nums ${product.stock <= product.minStock ? "text-amber-700" : ""}`}>{product.stock}</p>
            <p className="text-xs text-slate-500">Aviso con {product.minStock} o menos</p>
          </div>
        )}
      </div>

      {product.kind === "SERVICE" ? (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Los servicios no tienen stock.</p>
      ) : (
        <>
          <StockForms productId={product.id} currentStock={product.stock} tracksStock={product.trackStock} canPurchase={hasRole(session, CLIENT_MANAGE_ROLES)} canAdjust={hasRole(session, CLINIC_CONFIG_ROLES)} />

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Lotes con unidades</h2>
            {lots.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">Sin lotes registrados. Al ingresar mercadería podés cargar número de lote y vencimiento.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lots.map((lot) => {
                  const expired = lot.expiry === "expired";
                  const soon = lot.expiry === "soon";
                  return (
                    <li key={lot.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{lot.lotNumber ? `Lote ${lot.lotNumber}` : "Sin número de lote"}</span>
                        <span className="ml-2 text-xs text-slate-500">{lot.expiresAt ? `Vence ${formatDateShort(lot.expiresAt, timezone)}` : "Sin vencimiento"}</span>
                        {(expired || soon) && (
                          <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${expired ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                            <AlertTriangle size={11} />
                            {expired ? "Vencido" : "Por vencer"}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{lot.quantity} u.</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Historial de movimientos</h2>
            {movements.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">Todavía no hay movimientos.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {movements.map((movement) => (
                  <li key={movement.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-700">{movementLabel(movement.type)}</span>
                      <span className="block text-xs text-slate-500">
                        {formatDateShort(movement.createdAt, timezone)}
                        {movement.user && ` · ${movement.user.name}`}
                        {movement.pet && ` · ${movement.pet.name}`}
                        {movement.lot?.lotNumber && ` · Lote ${movement.lot.lotNumber}`}
                        {movement.supplier && ` · ${movement.supplier}`}
                        {movement.unitCost !== null && ` · ${formatMoney(movement.unitCost)} c/u`}
                        {movement.note && ` · ${movement.note}`}
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${movement.quantity > 0 ? "text-emerald-700" : "text-slate-700"}`}>
                      {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
