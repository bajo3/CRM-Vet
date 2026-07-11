export default function AgendaLoading() {
  return (
    <section className="animate-pulse px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-8 w-40 rounded-lg bg-slate-200" />
        <div className="h-11 w-36 rounded-xl bg-slate-200" />
      </div>
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="h-10 w-64 rounded-xl bg-slate-100" />
        <div className="h-10 w-48 rounded-xl bg-slate-100" />
        <div className="h-10 w-40 rounded-xl bg-slate-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-64 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
    </section>
  );
}
