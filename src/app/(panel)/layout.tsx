import { PawPrint, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { logout } from "@/lib/actions/auth";
import { roleLabel } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { SidebarNav, BottomNav } from "./nav-links";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const prisma = getPrisma();
  const [clinic, unreadConversations] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: session.clinicId }, select: { name: true } }),
    prisma.whatsappConversation.count({ where: { clinicId: session.clinicId, status: "REQUIRES_HUMAN" } }),
  ]);

  return (
    <div className="min-h-screen bg-[#f6f8f5] text-slate-900 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-slate-200 bg-white px-5 py-6 lg:flex lg:flex-col">
        <div className="mb-9 flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-600 text-white">
            <PawPrint size={22} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold">Vet Simple</div>
            <div className="truncate text-xs text-slate-500">{clinic?.name ?? "Clínica"}</div>
          </div>
        </div>

        <SidebarNav unreadConversations={unreadConversations} />

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="truncate text-sm font-medium">{session.name}</div>
            <div className="text-xs text-slate-500">{roleLabel(session.role)}</div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <LogOut size={16} />
              Salir
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pb-16 lg:pb-0">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-white">
              <PawPrint size={16} />
            </span>
            <div className="text-sm font-semibold">{clinic?.name ?? "Clínica"}</div>
          </div>
          <form action={logout}>
            <button type="submit" aria-label="Salir" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-50">
              <LogOut size={18} />
            </button>
          </form>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      <BottomNav unreadConversations={unreadConversations} />
    </div>
  );
}
