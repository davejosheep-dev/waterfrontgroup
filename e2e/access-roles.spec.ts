import { expect, test } from "@playwright/test";

test("superadmin can open the role directory and member editor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Team access" }).click();

  await expect(page.getByRole("heading", { name: "Team access" })).toBeVisible();
  await expect(page.getByText("Owner", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("All concepts · view only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Deactivate Account Owner" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset password for Account Owner" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Isabel Tan" }).click();
  await expect(page.getByRole("dialog", { name: "Modify access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset password", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByRole("dialog", { name: "Add a member" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Waterfront · Iloilo" })).toBeChecked();
  await page.getByRole("button", { name: /Owner All concepts/ }).click();
  await expect(page.getByRole("radio", { name: "Waterfront · Iloilo" })).toHaveCount(0);
  await page.getByRole("button", { name: /Manager One or more assigned concepts/ }).click();
  await expect(page.getByRole("checkbox", { name: "Waterfront · Iloilo" })).toBeChecked();
  await expect(page.getByText("Superadmins can grant a Manager access to one or more concepts.")).toBeVisible();
});

test("every signed-in role can open their profile security section", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open profile" }).click();

  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
  await expect(page.locator("#profile-current-password")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.locator("#profile-new-password")).toHaveAttribute("autocomplete", "new-password");
  await expect(page.getByRole("button", { name: "Show current password" })).toBeVisible();
});
