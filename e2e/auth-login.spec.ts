import { expect, test } from "@playwright/test";

test("staff can choose email or username while password reset stays email-only", async ({ page }) => {
  await page.goto("/login");

  const emailOption = page.getByRole("button", { name: "Email", exact: true });
  const usernameOption = page.getByRole("button", { name: "Username", exact: true });
  await expect(emailOption).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Work email")).toHaveAttribute("type", "email");

  await usernameOption.click();
  await expect(usernameOption).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Username")).toHaveAttribute("type", "text");
  await expect(page.getByLabel("Username")).toHaveAttribute("placeholder", "mika.reyes");

  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.getByText("Password reset requires the work email attached to your account.")).toBeVisible();
  await expect(page.getByLabel("Work email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Username")).toHaveCount(0);
});

test("password update form requires matching new passwords", async ({ page }) => {
  await page.goto("/update-password");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByLabel("New password")).toHaveAttribute("autocomplete", "new-password");
  await expect(page.getByLabel("Confirm password")).toHaveAttribute("autocomplete", "new-password");
});

test("staff can reveal and hide the sign-in password", async ({ page }) => {
  await page.goto("/login");

  const password = page.getByRole("textbox", { name: "Password" });
  await expect(password).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});
