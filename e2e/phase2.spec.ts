import { expect, test } from "@playwright/test";

test("guest submits a Main Dining request and opens the secure status page", async ({ page }) => {
  await page.goto("/reserve/waterfront-seafood");
  await expect(page.getByRole("heading", { name: "What are you celebrating?" })).toBeVisible();
  await expect(page.getByText("Your request is not confirmed until Waterfront staff approves it and sends confirmation.").first()).toBeVisible();

  await page.getByRole("button", { name: /Main Dining/ }).click();
  await page.getByRole("button", { name: "Choose schedule" }).click();
  await expect(page.getByRole("heading", { name: "Choose a preferred schedule" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with this time" }).click();

  await page.getByLabel("Full name").fill("Fictional Public Guest");
  await page.getByLabel("Mobile number").fill("0917 333 2222");
  await page.getByLabel("Email").fill("public@example.com");
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByLabel("Accept reservation terms and privacy notice").check();
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByRole("heading", { name: "Thank you, Fictional." })).toBeVisible();
  await expect(page.getByText(/WFR-2026-/)).toBeVisible();
  await page.getByRole("link", { name: "View request status" }).click();
  await expect(page.getByRole("heading", { name: "Main Dining" })).toBeVisible();
  await expect(page.getByText(/submitted/i).first()).toBeVisible();
});

test("staff reviews and atomically converts an available public request", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Public Requests/ }).click();
  await expect(page.getByRole("heading", { name: "Public Requests" })).toBeVisible();
  await page.getByLabel("Request status filter").selectOption("all");
  await page.getByLabel("Search public requests").fill("Sofia Ramirez");
  await page.getByRole("button", { name: /Sofia Ramirez/ }).click();
  const startReview = page.getByRole("button", { name: /Start review/ });
  if (await startReview.isVisible()) {
    await startReview.click();
    await expect(page.getByRole("button", { name: /Recheck & convert/ })).toBeEnabled();
    await page.getByRole("button", { name: /Recheck & convert/ }).click();
  }
  await expect(page.getByText(/Linked reservation: WF-/)).toBeVisible();
});

test("stale availability cannot be converted and preserves alternative workflow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Public Requests/ }).click();
  await page.getByLabel("Search public requests").fill("Adrian Lim");
  await page.getByRole("button", { name: /Adrian Lim/ }).click();
  await expect(page.getByText("Conversion is blocked because current availability changed.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Recheck & convert/ })).toBeDisabled();
  await page.getByLabel("Alternative schedule").fill("Aug 9 at 8:30 PM");
  await page.getByLabel("Guest-facing message").fill("We can welcome your party at 8:30 PM.");
  await page.getByRole("button", { name: "Propose alternative" }).click();
  await expect(page.getByText(/Aug 9 at 8:30 PM/)).toBeVisible();
});
