import { expect, test } from "@playwright/test";

test("manager independently verifies a proof-complete GCash claim", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Payments/ }).click();
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(page.getByText("Adrian Lim").first()).toBeVisible();
  await page.getByLabel("Complete verification checklist").check();
  await page.getByRole("button", { name: "Verify payment" }).click();
  await expect(page.getByRole("status")).toContainText(/Payment verified/);
});

test("the recorder cannot verify their own BDO terminal claim", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Payments/ }).click();
  await page.getByRole("button", { name: /Isabel Villanueva/ }).click();
  await expect(page.getByText(/Mika Reyes recorded this payment/)).toBeVisible();
  await page.getByLabel("Complete verification checklist").check();
  await expect(page.getByRole("button", { name: "Verify payment" })).toBeDisabled();
  await expect(page.getByText("Visa ·•••• 1184")).toBeVisible();
});

test("a submitted deposit claim cannot manually confirm a reservation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Adrian Lim WF-260807-015/ }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("status")).toContainText(/Confirmation blocked/);
  await expect(page.getByText("Pending deposit").first()).toBeVisible();
});

test("recording a manual payment requires a valid proof attachment", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Payments/ }).click();
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("External reference").fill("GC-NEW-2201");
  await page.getByLabel("Payment proof file").setInputFiles({ name: "fictional-proof.png", mimeType: "image/png", buffer: Buffer.from("fictional safe proof file") });
  await expect(page.getByText(/fictional-proof.png/)).toBeVisible();
  await page.locator('form input[type="checkbox"]').check();
  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expect(page.getByRole("status")).toContainText(/submitted for independent verification/);
});

test("reconciliation, channel controls, and manual messaging remain human-controlled", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Payments/ }).click();
  await page.getByRole("button", { name: /Daily reconciliation/ }).click();
  await expect(page.getByRole("heading", { name: "Daily reconciliation" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare day close" }).click();
  await expect(page.getByRole("button", { name: "Awaiting independent review" })).toBeDisabled();

  await page.getByRole("button", { name: /Payment channels/ }).click();
  await expect(page.getByRole("heading", { name: "Payment channels" })).toBeVisible();
  await expect(page.getByText("No live account configured")).toBeVisible();

  await page.getByRole("button", { name: /^Messaging/ }).click();
  await expect(page.getByRole("heading", { name: "Messaging operations" })).toBeVisible();
  await page.getByRole("button", { name: "Copy approved message" }).click();
  await expect(page.getByText("Status: Prepared for manual send")).toBeVisible();
  await page.getByRole("button", { name: "Mark manually sent" }).click();
  await expect(page.getByText("Status: Manually sent by Mika Reyes")).toBeVisible();
});
