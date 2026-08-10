"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { AppState } from "@/components/ui/app-state";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Waterfront route error", { digest: error.digest });
  }, [error]);

  return <AppState eyebrow="Operations interrupted" title="This view could not be loaded" description="No changes were made. Try loading this view again; if the problem continues, share the reference shown in the logs with your administrator." icon={<TriangleAlert size={22} />} action={<button type="button" onClick={() => retry()} className="wf-button-primary px-5">Try again</button>} />;
}
