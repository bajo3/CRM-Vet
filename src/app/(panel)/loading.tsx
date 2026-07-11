export default function PanelLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-7 px-4 py-7 sm:px-7 lg:px-10">
      <div className="space-y-3"><div className="h-4 w-32 rounded bg-slate-200" /><div className="h-8 w-64 rounded-lg bg-slate-200" /><div className="h-4 w-96 max-w-full rounded bg-slate-100" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="size-10 rounded-xl bg-slate-100" /><div className="mt-5 h-7 w-16 rounded bg-slate-200" /><div className="mt-2 h-3 w-28 rounded bg-slate-100" /></div>)}</div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><div className="h-80 rounded-3xl border border-slate-200 bg-white" /><div className="h-80 rounded-3xl border border-slate-200 bg-white" /></div>
    </div>
  );
}
