"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, Building2, CalendarCheck, MessageCircle, UserRound, UsersRound } from "lucide-react";

const TABS = [
  { href: "/configuracion", label: "Clínica", icon: Building2, adminOnly: false },
  { href: "/configuracion/whatsapp", label: "WhatsApp", icon: MessageCircle, adminOnly: true },
  { href: "/configuracion/recordatorios", label: "Recordatorios", icon: BellRing, adminOnly: false },
  { href: "/configuracion/reserva-online", label: "Reserva online", icon: CalendarCheck, adminOnly: true },
  { href: "/configuracion/equipo", label: "Equipo", icon: UsersRound, adminOnly: false },
  { href: "/configuracion/mi-cuenta", label: "Mi cuenta", icon: UserRound, adminOnly: false },
];

export function ConfigTabs({ canEdit }: { canEdit: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => canEdit || !tab.adminOnly);

  return (
    <nav aria-label="Secciones de configuración" className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-slate-200">
        {tabs.map((tab) => {
          const active = tab.href === "/configuracion" ? pathname === "/configuracion" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-10 items-center gap-2 px-3 text-sm font-medium transition-colors ${active ? "text-brand-700" : "text-slate-500 hover:text-slate-800"}`}
              >
                <tab.icon size={16} />
                {tab.label}
                {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
