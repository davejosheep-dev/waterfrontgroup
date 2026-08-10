import Link from "next/link";
import type { ReactNode } from "react";

type AppStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function AppState({ eyebrow, title, description, icon, action }: AppStateProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-6">
      <section className="wf-surface w-full max-w-lg p-8 text-center shadow-soft">
        {icon ? <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div> : null}
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{eyebrow}</p>
        <h1 className="font-display mt-2 text-3xl text-foreground">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </section>
    </main>
  );
}

export function HomeLink({ label = "Return to operations" }: { label?: string }) {
  return <Link href="/" className="wf-button-primary inline-flex items-center justify-center px-5">{label}</Link>;
}
