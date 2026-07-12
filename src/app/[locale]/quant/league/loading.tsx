export default function QuantResultsLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl animate-pulse px-4 py-8 motion-reduce:animate-none sm:px-6 lg:px-8" aria-busy="true">
      <div className="mb-10 space-y-4">
        <div className="h-4 w-36 rounded bg-foreground/10" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="h-9 w-72 max-w-full rounded bg-foreground/10" />
            <div className="h-5 w-full max-w-2xl rounded bg-foreground/10" />
          </div>
          <div className="h-5 w-40 rounded bg-foreground/10" />
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-16 rounded-xl bg-foreground/[0.06]" />
          <div className="h-16 rounded-xl bg-foreground/[0.06]" />
        </div>

        <div className="rounded-2xl bg-surface-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)]">
          <div className="h-5 w-40 rounded bg-foreground/10" />
          <div className="mt-2 h-4 w-72 max-w-full rounded bg-foreground/10" />
          <div className="mt-5 space-y-3">
            {[0, 1, 2].map(row => (
              <div key={row} className="h-9 rounded-lg bg-foreground/[0.06]" />
            ))}
          </div>
        </div>

        <div className="h-[26rem] rounded-2xl bg-foreground/[0.06]" />
        <div className="h-[26rem] rounded-2xl bg-foreground/[0.06]" />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-80 rounded-2xl bg-foreground/[0.06]" />
          <div className="h-80 rounded-2xl bg-foreground/[0.06]" />
        </div>
      </div>
    </main>
  );
}
