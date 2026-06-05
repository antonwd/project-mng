import { test, expect } from "@playwright/test";

test("login → apps → new app → deploy", async ({ page }) => {
  await page.goto("/login");

  // Switch to the password tab (passkey requires WebAuthn which the mock can't fulfill).
  await page.getByRole("tab", { name: "Password + TOTP" }).click();
  const passwordTab = page.getByRole("tabpanel", { name: "Password + TOTP" });
  await passwordTab.locator("#email").fill("smoke@a.com");
  await passwordTab.locator("#password").fill("hunter2");
  await passwordTab.locator("#totp").fill("123456");
  await passwordTab.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole("heading", { name: "Apps", exact: true })).toBeVisible();

  // No apps yet → CTA visible.
  await page.getByRole("link", { name: /create your first app|new app/i }).first().click();
  await expect(page).toHaveURL(/\/apps\/new$/);

  // Step 1: pick repo. Shadcn/base-ui Selects expose triggers as comboboxes; identify by visible text.
  const triggers = page.getByRole("combobox");
  await triggers.nth(0).click();
  await page.getByRole("option", { name: "smoke-org" }).click();
  await triggers.nth(1).click();
  await page.getByRole("option", { name: "smoke-org/hello" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: configure + create.
  await page.getByRole("button", { name: "Create app" }).click();

  await expect(page).toHaveURL(/\/apps\/hello$/);
  await expect(page.getByRole("heading", { name: "hello" })).toBeVisible();

  // Click Deploy latest on the overview page.
  await page.getByRole("button", { name: /deploy latest/i }).first().click();

  // After deploy, the overview re-renders with a "building" status badge.
  await expect(page.getByText("building").first()).toBeVisible({ timeout: 10_000 });
});
