import { LogIn } from "lucide-react";
import Link from "next/link";
import { AppState } from "@/components/ui/app-state";

export default function UnauthorizedPage() {
  return <AppState eyebrow="Authentication required" title="Please sign in to continue" description="Your session is missing or has expired. Sign in again with your Waterfront staff account." icon={<LogIn size={22} />} action={<Link href="/login" className="wf-button-primary inline-flex items-center justify-center px-5">Sign in</Link>} />;
}
