"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ unreadConversations }: { unreadConversations: number }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1 text-sm">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 font-medium transition-colors ${
              active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <item.icon size={18} />
            {item.label}
            {item.href === "/mensajes" && unreadConversations > 0 && (
              <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">{unreadConversations}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ unreadConversations }: { unreadConversations: number }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
              active ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            <item.icon size={20} />
            {item.label === "Clientes y mascotas" ? "Clientes" : item.label}
            {item.href === "/mensajes" && unreadConversations > 0 && (
              <span className="absolute right-4 top-1 size-2 rounded-full bg-rose-500" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
