import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ className, variant = "primary", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    primary: "border border-transparent bg-primary text-primary-foreground hover:bg-primary-strong",
    secondary: "border border-border bg-card text-secondary-foreground hover:bg-secondary",
    ghost: "border border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
    danger: "border border-red-200 bg-card text-red-700 hover:bg-red-50",
  };

  return <button {...props} className={cx("inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-45", variants[variant], className)}>{children}</button>;
}

export function PageHeader({ eyebrow, title, description, children, className }: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return <header className={cx("border-b border-border bg-card", className)}>
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-6 md:flex-row md:items-end md:justify-between md:px-6">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1.5 text-xs font-medium text-accent-strong">{eyebrow}</p> : null}
        <h1 className="font-display text-2xl leading-tight text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
    </div>
  </header>;
}

export function SectionCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-lg border border-border bg-card", className)}>{children}</section>;
}
