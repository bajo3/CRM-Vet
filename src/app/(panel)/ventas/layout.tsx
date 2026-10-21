import { requireSession } from "@/lib/auth/session";
import { listProducts } from "@/lib/services/sales";
import { VentasTabs } from "./ventas-tabs";

// Ventas, caja, cuentas corrientes y stock son tareas distintas: cada una tiene su pestaña en vez de
// convivir todas en una sola pantalla.
export default async function VentasLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const products = await listProducts(session.clinicId, true);
  const lowStock = products.filter((product) => product.lowStock).length;

  return (
    <section className="mx-auto max-w-6xl px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <VentasTabs lowStock={lowStock} />
      {children}
    </section>
  );
}
