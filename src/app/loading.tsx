export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-6" aria-busy="true" aria-live="polite">
      <div className="wf-surface w-full max-w-md p-8 shadow-soft">
        <div className="h-3 w-24 animate-pulse rounded-full bg-primary-soft" />
        <div className="mt-5 h-8 w-3/4 animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-muted" />
        <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-muted" />
        <span className="sr-only">Loading Waterfront operations</span>
      </div>
    </main>
  );
}
