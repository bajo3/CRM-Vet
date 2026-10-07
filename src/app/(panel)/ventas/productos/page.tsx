import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { listProducts } from "@/lib/services/sales";
import { ProductManager } from "./product-manager";

export default async function ProductosPage() {
  const session = await requireSession();
  const products = await listProducts(session.clinicId);

  return (
    <section className="mx-auto max-w-4xl px-4 py-5 sm:px-7 lg:py-8">
      <Link href="/ventas" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} />
        Ventas y caja
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Productos y servicios</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Lo que la clínica vende y cobra. Si activás el control de stock en un producto, cada venta descuenta unidades y te avisamos cuando queda poco.
      </p>
      <ProductManager products={products} canEdit={hasRole(session, CLINIC_CONFIG_ROLES)} />
    </section>
  );
}
