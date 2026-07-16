import Link from "next/link";
import { PawPrint } from "lucide-react";
import { RegistrationForm } from "./registration-form";

export default function RegistroPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8f5] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
            <PawPrint size={28} />
          </span>
          <div>
            <div className="text-lg font-semibold">Vet Simple</div>
            <div className="text-sm text-slate-500">Registrá tu clínica</div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <RegistrationForm />
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-emerald-700 hover:underline">
            Iniciá sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
