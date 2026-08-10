import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ password?: string; reset?: string }> }) {
  const query = await searchParams;
  const notice = query.password === "updated"
    ? "Your password was updated. Sign in with your email or username."
    : query.reset === "invalid"
      ? "That reset link is invalid or expired. Request a new one."
      : undefined;

  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
    <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-[0_16px_50px_rgba(23,35,33,.07)] sm:p-8">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <Image src="/waterfront-logo.png" alt="Waterfront Seafood & Cocktails" width={146} height={93} priority className="h-auto w-36" />
        <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground">Staff access</span>
      </div>
      <div className="pt-6">
        <div className="text-xs font-medium text-accent-strong">Reservations workspace</div>
        <h1 className="font-display mt-2 text-[28px] leading-tight text-foreground">Welcome back</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in with your authorized Waterfront staff account.</p>
        <LoginForm notice={notice} />
        <div className="mt-6 flex items-start gap-2 rounded-lg bg-primary-soft p-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
          Access is limited by staff role and outlet assignment. Important booking and payment changes are audited.
        </div>
      </div>
    </section>
  </main>;
}
