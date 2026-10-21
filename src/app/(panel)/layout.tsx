import { redirect } from "next/navigation";
import { PawPrint, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { logout } from "@/lib/actions/auth";
import { roleLabel } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getClinicSettings } from "@/lib/queries/clinic";
import { SidebarNav, BottomNav } from "./nav-links";
import { WhatsappAlertBanner } from "./whatsapp-alert-banner";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!session.clinicId) redirect("/admin/clinicas");
  const prisma = getPrisma();
  const [clinic, unreadConversations] = await Promise.all([
    getClinicSettings(session.clinicId),
    prisma.whatsappConversation.count({ where: { clinicId: session.clinicId, status: "REQUIRES_HUMAN" } }),
  ]);

  return (
    <div className="min-h-screen bg-background text-slate-900 lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col bg-ink-900 px-3 py-4 text-slate-300 lg:flex">
        <div className="mb-5 flex items-center gap-2.5 px-2.5 pt-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset]">
            <PawPrint size={17} strokeWidth={2.4} />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-white">Vet Simple</span>
        </div>

        <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.06]">
          {clinic?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logoUrl} alt={clinic.name} className="size-9 shrink-0 rounded-lg bg-white object-contain" />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-700 text-sm font-semibold text-white">
              {(clinic?.name ?? "C").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Clínica</div>
            <div className="truncate text-sm font-semibold text-white">{clinic?.name ?? "Clínica"}</div>
          </div>
        </div>

        <SidebarNav unreadConversations={unreadConversations} />

        <div className="mt-auto flex items-center gap-2.5 border-t border-white/[0.06] px-1.5 pt-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-200">
            {(session.name || "?").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{session.name}</div>
            <div className="text-xs text-slate-500">{roleLabel(session.role)}</div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Salir"
              title="Salir"
              className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-10 flex items-center justify-between bg-ink-900 px-4 py-2.5 text-white lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            {clinic?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinic.logoUrl} alt={clinic.name} className="size-8 shrink-0 rounded-lg bg-white object-contain" />
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
                <PawPrint size={16} strokeWidth={2.4} />
              </span>
            )}
            <div className="truncate text-sm font-semibold">{clinic?.name ?? "Clínica"}</div>
          </div>
          <form action={logout}>
            <button type="submit" aria-label="Salir" className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">
              <LogOut size={18} />
            </button>
          </form>
        </header>

        <WhatsappAlertBanner />
        <main className="min-h-0 flex-1">{children}</main>
      </div>

      <BottomNav unreadConversations={unreadConversations} />
    </div>
  );
}
