import type { Metadata } from "next";
import { PublicTableBookingFlow } from "@/components/public-table-booking-flow";

export const metadata: Metadata = {
  title: "Reserve a Table | Waterfront Seafood & Cocktails",
  description: "Find live table-aware availability and reserve your Waterfront table in Iloilo City.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function WaterfrontTableBookingPage() {
  return <PublicTableBookingFlow />;
}
