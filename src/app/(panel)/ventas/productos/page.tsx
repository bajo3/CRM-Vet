import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession, hasRole } from "@/lib/auth/session";
import { CLINIC_CONFIG_ROLES } from "@/lib/auth/roles";
import { listProducts } from "@/lib/services/sales";
import { ProductManager, type ProductFilter } from "./product-manager";

const FILTERS: ProductFilter[] = ["todos", "bajo", "servicios", "baja"];

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const session = await requireSession();
  const { filtro } = await searchParams;
  const products = await listProducts(session.clinicId);

  return (
    <section className="mx-auto max-w-6xl px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <Link href="/ventas" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft size={15} />
        Caja
      </Link>
      <ProductManager products={products} canEdit={hasRole(session, CLINIC_CONFIG_ROLES)} initialFilter={FILTERS.find((value) => value === filtro) ?? "todos"} />
    </section>
  );
}
