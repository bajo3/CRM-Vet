export default function MensajesLoading() {
  return (
    <div className="grid h-[calc(100dvh-7.5625rem)] min-h-0 animate-pulse overflow-hidden bg-white lg:h-screen lg:grid-cols-[380px_1fr]">
      <aside className="hidden flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-100 p-5">
          <div className="h-7 w-32 rounded-lg bg-slate-200" />
          <div className="mt-4 flex gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-7 w-20 rounded-full bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-1 p-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 rounded-xl bg-slate-50" />
          ))}
        </div>
      </aside>
      <section className="hidden flex-col bg-[#f4f7f5] lg:flex" />
    </div>
  );
}
