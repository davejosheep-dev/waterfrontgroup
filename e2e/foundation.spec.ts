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
  expect(response.status()).toBe(200);
  const payload = await response.json() as { status: string; service: string; requestId: string };
  expect(payload).toMatchObject({ status: "ready", service: "waterfront-reservations" });
  expect(payload.requestId).toBeTruthy();
  expect(response.headers()["x-request-id"]).toBe(payload.requestId);
});
