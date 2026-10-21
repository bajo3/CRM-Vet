import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { getClinicSettings } from "@/lib/queries/clinic";
import { listProducts } from "@/lib/services/sales";
import { listExpiringLots } from "@/lib/services/stock";
import { formatDateShort } from "@/lib/format";
import { ProductManager, type ProductFilter } from "./product-manager";

const FILTERS: ProductFilter[] = ["todos", "bajo", "servicios", "baja"];

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const session = await requireSession();
  const { filtro } = await searchParams;
  const [products, expiringLots, clinic] = await Promise.all([listProducts(session.clinicId), listExpiringLots(session.clinicId), getClinicSettings(session.clinicId)]);
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const lowStock = products.filter((product) => product.active && product.lowStock);

  return (
    <div className="space-y-5">
      {(lowStock.length > 0 || expiringLots.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {lowStock.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle size={16} />
                Para reponer
              </h2>
              <ul className="mt-2 space-y-1">
                {lowStock.slice(0, 6).map((product) => (
                  <li key={product.id}>
                    <Link href={`/ventas/productos/${product.id}`} className="flex items-center justify-between gap-3 rounded-md px-1 py-1 text-sm text-amber-950 hover:bg-amber-100/70">
                      <span className="truncate">{product.name}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        Quedan {product.stock} · mínimo {product.minStock}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {lowStock.length > 6 && <p className="mt-1 px-1 text-xs text-amber-800">Y {lowStock.length - 6} más (filtro “Stock bajo”).</p>}
            </section>
          )}
          {expiringLots.length > 0 && (
            <section className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                <CalendarClock size={16} />
                Vencidos o por vencer
              </h2>
              <ul className="mt-2 space-y-1">
                {expiringLots.slice(0, 6).map((lot) => (
                  <li key={lot.id}>
                    <Link href={`/ventas/productos/${lot.product.id}`} className="flex items-center justify-between gap-3 rounded-md px-1 py-1 text-sm text-rose-950 hover:bg-rose-100/70">
                      <span className="truncate">
                        {lot.product.name}
                        {lot.lotNumber && <span className="text-rose-700"> · Lote {lot.lotNumber}</span>}
                      </span>
                      <span className="shrink-0 text-xs font-semibold">{lot.expired ? "Vencido" : `Vence ${formatDateShort(lot.expiresAt!, timezone)}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {expiringLots.length > 6 && <p className="mt-1 px-1 text-xs text-rose-800">Y {expiringLots.length - 6} más.</p>}
            </section>
          )}
        </div>
      )}

      <ProductManager products={products} canEdit={hasRole(session, CLINIC_CONFIG_ROLES)} initialFilter={FILTERS.find((value) => value === filtro) ?? "todos"} />
    </div>
  );
}
