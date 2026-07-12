export default function QuantResultsLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl animate-pulse px-4 py-8 motion-reduce:animate-none sm:px-6 lg:px-8" aria-busy="true">
      <div className="mb-10 space-y-4">
        <div className="h-4 w-36 rounded bg-foreground/10" />
        <div className="h-10 w-72 max-w-full rounded bg-foreground/10" />
        <div className="h-5 w-full max-w-2xl rounded bg-foreground/10" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]">
        <div className="h-[28rem] rounded-3xl bg-foreground/[0.06]" />
        <div className="h-[28rem] rounded-3xl bg-foreground/[0.06]" />
      </div>
    </main>
  );
}
