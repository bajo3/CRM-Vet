import Link from "next/link";
import { PawPrint } from "lucide-react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm shadow-brand-200">
            <PawPrint size={28} />
          </span>
          <div>
            <div className="text-lg font-semibold">Vet Simple</div>
            <div className="text-sm text-slate-500">Iniciá sesión para entrar al panel</div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          ¿Sos una clínica nueva?{" "}
          <Link href="/registro" className="font-medium text-brand-700 hover:underline">
            Registrate acá
          </Link>
        </p>
      </div>
    </main>
  );
}
