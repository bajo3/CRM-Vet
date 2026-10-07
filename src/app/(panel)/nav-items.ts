import { BarChart3, BellRing, CalendarDays, FolderOpen, MessageCircle, PawPrint, Settings, UsersRound, Wallet, type LucideIcon } from "lucide-react";

/** `desktopOnly`: no entra en la barra inferior del celular, que ya está completa. */
export type NavItem = { href: string; label: string; icon: LucideIcon; desktopOnly?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: PawPrint },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/clientes", label: "Clientes y mascotas", icon: UsersRound },
  { href: "/recordatorios", label: "Recordatorios", icon: BellRing },
  { href: "/documentos", label: "Documentos", icon: FolderOpen },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle },
  { href: "/ventas", label: "Ventas y caja", icon: Wallet, desktopOnly: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, desktopOnly: true },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];
