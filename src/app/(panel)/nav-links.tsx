"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ unreadConversations }: { unreadConversations: number }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5 text-sm">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center gap-3 rounded-lg px-2.5 py-2 font-medium transition-colors ${
              active ? "bg-white/[0.08] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
            }`}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-400" aria-hidden />}
            <item.icon size={17} className={active ? "text-brand-300" : ""} />
            {item.label}
            {item.href === "/mensajes" && unreadConversations > 0 && (
              <span className="ml-auto min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">{unreadConversations}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ unreadConversations }: { unreadConversations: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = NAV_ITEMS.filter((item) => item.mobile);
  const more = NAV_ITEMS.filter((item) => !item.mobile);
  const moreActive = more.some((item) => isActive(pathname, item.href));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="Más secciones">
          <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-900/30" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl">
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <span className="text-sm font-semibold text-slate-700">Más secciones</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {more.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center text-xs font-medium ${
                        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <item.icon size={20} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-brand-600" : "text-slate-500"}`}
            >
              {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand-500" aria-hidden />}
              <item.icon size={20} />
              {item.shortLabel ?? item.label}
              {item.href === "/mensajes" && unreadConversations > 0 && <span className="absolute right-1/2 top-1.5 mr-[-14px] size-2 rounded-full bg-rose-500" />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${moreActive ? "text-brand-700" : "text-slate-500"}`}
        >
          <Menu size={20} />
          Más
        </button>
      </nav>
    </>
  );
}
