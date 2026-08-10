import { expect, test } from "@playwright/test";

test("staff can check availability and create a reservation in demo mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today’s reservations" })).toBeVisible();
  await page.getByRole("button", { name: "Check availability" }).click();
  await expect(page.getByText("Available — general seating")).toBeVisible();
  await page.getByRole("button", { name: /Continue to reservation/ }).click();
  await page.getByLabel("Full name").fill("Fictional Test Guest");
  await page.getByLabel("Mobile number").fill("0917 123 4567");
  await page.getByRole("button", { name: "Create reservation" }).click();
  await expect(page.getByText("Fictional Test Guest")).toBeVisible();
});

test("calendar, guests, reports, and configuration are reachable", async ({ page }) => {
  await page.goto("/");
  for (const [link, heading] of [["Calendar", "Week at a glance"], ["Guests", "Guest directory"], ["Reports", "Reservation overview"], ["Configuration", "Policies & resources"]]) {
    await page.getByRole("button", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("floor management shows live tables and reservation controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Floor plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Main Dining floor" })).toBeVisible();
  await expect(page.getByText("Reservation queue")).toBeVisible();
  await page.getByRole("button", { name: "T1-5, 2 seats, available" }).click();
  await expect(page.getByText("2-seat table available")).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign table" })).toBeVisible();
  await page.getByLabel("Search reservation queue").fill("Grace");
  await expect(page.getByText("Grace Ong")).toBeVisible();
});

test("manager can drag tables and create a merged combination", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Floor plan", exact: true }).click();
  await page.getByRole("button", { name: "Edit layout" }).click();
  await expect(page.getByText("Floor setup")).toBeVisible();

  const table = page.getByRole("button", { name: "T1-1, 2 seats, reserved" });
  const before = await table.boundingBox();
  if (!before) throw new Error("Editable table was not visible");
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 35, before.y + before.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  const after = await table.boundingBox();
  expect(after?.x).toBeGreaterThan(before.x + 20);
  await page.getByRole("button", { name: "Rotate 45°" }).click();
  await expect(page.getByText("45°", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Merge tables" }).click();
  await page.getByRole("button", { name: "T1-1, 2 seats, reserved" }).click();
  await page.getByRole("button", { name: "T1-2, 2 seats, reserved" }).click();
  await page.getByRole("button", { name: "Create combination" }).click();
  await expect(page.getByText("T1-1 + T1-2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByText(/Floor layout and table combinations saved/)).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("waterfront-floor-layout-v1"))).not.toBeNull();
});
