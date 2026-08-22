import { expect, test } from "@playwright/test";

test("authorized venue switcher carries the venue timezone context", async ({ page }) => {
  await page.goto("/");
  const switcher = page.getByLabel("Switch venue");
  await expect(switcher).toHaveValue("waterfront-iloilo");
  await switcher.selectOption("waterfront-training-sydney");
  await expect(page.getByText("Australia/Sydney")).toBeVisible();
  await expect(page.getByText(/Venue context changed to Waterfront Training/)).toBeVisible();
});

test("authorization fallback pages use the shared operations baseline", async ({ page }) => {
  await page.goto("/unauthorized");
  await expect(page.getByRole("heading", { name: "Please sign in to continue" })).toBeVisible();
  await page.goto("/forbidden");
  await expect(page.getByRole("heading", { name: "This venue is outside your assignment" })).toBeVisible();
});

test("readiness endpoint returns a correlation id without configuration details", async ({ request }) => {
  const response = await request.get("/api/v1/health");
  // This suite runs credential-free: playwright.config.ts sets APP_DEMO_MODE and
  // supplies no Supabase variables, so the probe is expected to report degraded.
  // Asserting "ready" here would only pass against a configured project, and
  // would mean the probe had stopped reflecting whether the data layer is
  // actually reachable — which is the one thing a readiness endpoint is for.
  expect(response.status()).toBe(503);
  const payload = await response.json() as { status: string; service: string; requestId: string };
  expect(payload).toMatchObject({ status: "degraded", service: "waterfront-reservations" });
  expect(payload.requestId).toBeTruthy();
  expect(response.headers()["x-request-id"]).toBe(payload.requestId);
  // The endpoint is public and unauthenticated. A degraded response must not
  // disclose which variable is missing or where the project lives.
  expect(JSON.stringify(payload)).not.toMatch(/supabase|secret|publishable|apikey|postgres|https?:\/\//i);
});
