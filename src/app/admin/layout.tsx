import { LogOut, ShieldCheck } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/session";
import { logout } from "@/lib/actions/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-[#f6f8f5] text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-7">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-900 text-white">
            <ShieldCheck size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold">Administración de la plataforma</div>
            <div className="text-xs text-slate-500">Vet Simple</div>
          </div>
        </div>
        <form action={logout}>
          <button type="submit" aria-label="Salir" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-50">
            <LogOut size={18} />
          </button>
        </form>
      </header>
      <main>{children}</main>
    </div>
  );
}
