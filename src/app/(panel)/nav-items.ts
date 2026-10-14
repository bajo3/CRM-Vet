import { BarChart3, BellRing, CalendarDays, FolderOpen, MessageCircle, PawPrint, Settings, UsersRound, Wallet, type LucideIcon } from "lucide-react";

/** `mobile`: va fijo en la barra inferior del celular; el resto queda dentro de "Más". */
export type NavItem = { href: string; label: string; shortLabel?: string; icon: LucideIcon; mobile?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: PawPrint, mobile: true },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, mobile: true },
  { href: "/clientes", label: "Clientes y mascotas", shortLabel: "Clientes", icon: UsersRound, mobile: true },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle, mobile: true },
  { href: "/ventas", label: "Ventas y caja", icon: Wallet },
  { href: "/recordatorios", label: "Recordatorios", icon: BellRing },
  { href: "/documentos", label: "Documentos", icon: FolderOpen },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];
