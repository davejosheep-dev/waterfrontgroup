import { ShieldX } from "lucide-react";
import { AppState, HomeLink } from "@/components/ui/app-state";

export default function ForbiddenPage() {
  return <AppState eyebrow="Access restricted" title="This venue is outside your assignment" description="Your account is valid, but it does not have the organization, venue, or permission required for this page." icon={<ShieldX size={22} />} action={<HomeLink />} />;
}
