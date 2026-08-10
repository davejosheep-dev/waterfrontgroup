import type { Metadata } from "next";
import { PublicPreferenceCenter } from "@/components/public-preference-center";

export const metadata: Metadata = { title: "Marketing preferences · Waterfront", robots: { index: false, follow: false } };

export default async function MarketingPreferencesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicPreferenceCenter token={token} />;
}
