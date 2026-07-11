"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[65vh] place-items-center p-6 text-center">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-600"><AlertCircle size={26} /></span>
        <h2 className="mt-5 text-xl font-semibold">No pudimos cargar esta sección</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Puede ser un problema temporal de conexión. Volvé a intentarlo en unos segundos.</p>
        <button type="button" onClick={reset} className="mx-auto mt-6 flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"><RefreshCw size={16} />Reintentar</button>
      </div>
    </div>
  );
}
