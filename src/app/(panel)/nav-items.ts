import { CalendarDays, MessageCircle, PawPrint, Settings, UsersRound, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: PawPrint },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/clientes", label: "Clientes y mascotas", icon: UsersRound },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];
