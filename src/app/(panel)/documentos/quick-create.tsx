"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Receipt, Search, X } from "lucide-react";

type PetOption = { id: string; name: string; species: string; clientName: string; clientPhone: string };

export function QuickCreate({ pets, canCreatePrescription }: { pets: PetOption[]; canCreatePrescription: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PetOption | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pets.slice(0, 6);
    return pets.filter((pet) => pet.name.toLowerCase().includes(q) || pet.clientName.toLowerCase().includes(q) || pet.clientPhone.includes(q)).slice(0, 6);
  }, [pets, query]);

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="mb-3 text-sm font-semibold text-slate-800">Crear presupuesto o receta</p>
      {selected ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
            <span className="truncate text-sm font-medium text-emerald-900">{selected.name}</span>
            <span className="truncate text-xs text-emerald-700">{selected.clientName}</span>
            <button type="button" onClick={() => setSelected(null)} className="ml-auto shrink-0 text-emerald-700 hover:text-emerald-900">
              <X size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/clientes/mascotas/${selected.id}?abrir=presupuesto`)}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Receipt size={15} />
            Presupuesto
          </button>
          {canCreatePrescription && (
            <button
              type="button"
              onClick={() => router.push(`/clientes/mascotas/${selected.id}?abrir=receta`)}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <FileText size={15} />
              Receta
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscá la mascota por nombre, tutor o teléfono..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          {query.trim().length > 0 && (
            <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {filtered.length === 0 ? (
                <p className="p-3 text-sm text-slate-400">No encontramos ninguna mascota.</p>
              ) : (
                filtered.map((pet) => (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => { setSelected(pet); setQuery(""); }}
                    className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50"
                  >
                    <span className="font-medium">{pet.name}</span>
                    <span className="truncate text-xs text-slate-500">{pet.species} · {pet.clientName}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
