import { expect, test } from "@playwright/test";
import { demoPreferenceToken } from "../src/lib/crm-demo-data";

test("staff can search a Guest 360 profile with authoritative visit definitions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Guests" }).click();
  await expect(page.getByRole("heading", { name: "Guest directory" })).toBeVisible();
  await page.getByLabel("Search CRM guests").fill("Camille");
  await page.getByRole("button", { name: /Camille Santos/ }).click();
  await expect(page.getByText("Guest 360")).toBeVisible();
  await expect(page.getByText("Only completed reservations")).toBeVisible();
  await page.getByRole("tab", { name: "Consent & suppression" }).click();
  await expect(page.getByText("Eligible by consent controls")).toBeVisible();
  await expect(page.getByText(/Production sending remains disabled/)).toBeVisible();
});

test("manager reviews an explainable duplicate and preserves unknown consent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Guests" }).click();
  await page.getByRole("button", { name: /Duplicates/ }).click();
  await expect(page.getByText("Exact mobile", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview merge" }).click();
  await expect(page.getByText("Unknown remains ineligible")).toBeVisible();
  await page.getByRole("button", { name: "Confirm reviewed merge" }).click();
  await expect(page.getByRole("status")).toContainText("Guest merge completed");
});

test("campaign review enforces maker-checker and blocks production scheduling", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Marketing" }).click();
  await expect(page.getByText(/Production marketing sends are locked/)).toBeVisible();
  await page.getByRole("button", { name: /Harbor Evenings/ }).click();
  await expect(page.getByRole("button", { name: "Approve as creator" })).toBeDisabled();
  await page.getByRole("button", { name: "Approve as Mika Reyes" }).click();
  await expect(page.getByRole("status")).toContainText("approved by a separate reviewer");
  await expect(page.getByRole("button", { name: "Schedule campaign" })).toBeDisabled();
});

test("segment builder rejects sensitive targeting fields", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Marketing" }).click();
  await page.getByRole("button", { name: "Segments" }).click();
  await page.getByRole("button", { name: "Try restricted field" }).click();
  await expect(page.getByText(/allergies is not an approved segmentation field/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save version" })).toBeDisabled();
});

test("guest can unsubscribe without affecting reservation messaging", async ({ page }) => {
  await page.goto(`/preferences/${demoPreferenceToken}`);
  await expect(page.getByRole("heading", { name: "Hello, Camille" })).toBeVisible();
  await page.getByRole("button", { name: "Unsubscribe from email" }).click();
  await expect(page.getByRole("status")).toContainText("Email marketing is now unsubscribed");
  await expect(page.getByText(/Reservation and payment updates are managed separately/)).toBeVisible();
});
