export default function ClientesLoading() {
  return (
    <section className="animate-pulse px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-8 w-56 rounded-lg bg-slate-200" />
        <div className="h-11 w-40 rounded-xl bg-slate-200" />
      </div>
      <div className="mb-6 h-12 max-w-xl rounded-xl bg-slate-100" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-24 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
    </section>
  );
}
