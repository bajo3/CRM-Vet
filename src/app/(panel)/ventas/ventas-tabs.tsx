"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, Package, Receipt, UsersRound } from "lucide-react";

const TABS = [
  { href: "/ventas", label: "Ventas", icon: Receipt, match: (path: string) => path === "/ventas" },
  { href: "/ventas/caja", label: "Caja", icon: Banknote, match: (path: string) => path.startsWith("/ventas/caja") },
  { href: "/ventas/cuentas", label: "Cuentas corrientes", shortLabel: "Cuentas", icon: UsersRound, match: (path: string) => path.startsWith("/ventas/cuentas") },
  { href: "/ventas/productos", label: "Stock", icon: Package, match: (path: string) => path.startsWith("/ventas/productos") },
];

export function VentasTabs({ lowStock }: { lowStock: number }) {
  const pathname = usePathname();
  // Cargar una venta es una tarea con foco: sin pestañas, solo el formulario y "volver".
  if (pathname.startsWith("/ventas/nueva")) return null;

  return (
    <div className="mb-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Ventas y caja</h1>
      <nav aria-label="Secciones de ventas" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-slate-200">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-10 items-center gap-2 px-3 text-sm font-medium transition-colors ${
                    active ? "text-brand-700" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <tab.icon size={16} />
                  <span className="sm:hidden">{tab.shortLabel ?? tab.label}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.href === "/ventas/productos" && lowStock > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-800" title={`${lowStock} con stock bajo`}>
                      {lowStock}
                    </span>
                  )}
                  {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
