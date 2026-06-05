import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 375, height: 800 } });

async function assertNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const html = document.documentElement;
    return { scroll: html.scrollWidth, client: html.clientWidth };
  });
  expect(overflow.scroll, `horizontal scroll on ${label} (${overflow.scroll} > ${overflow.client})`).toBeLessThanOrEqual(overflow.client);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Password + TOTP" }).click();
  const passwordTab = page.getByRole("tabpanel", { name: "Password + TOTP" });
  await passwordTab.locator("#email").fill("smoke@a.com");
  await passwordTab.locator("#password").fill("hunter2");
  await passwordTab.locator("#totp").fill("123456");
  await passwordTab.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/apps$/);
}

test("mobile (375px): no horizontal scroll on public routes", async ({ page }) => {
  await page.goto("/login");
  await assertNoHorizontalScroll(page, "/login");
});

test("mobile (375px): no horizontal scroll on top-level routes", async ({ page }) => {
  await login(page);
  await assertNoHorizontalScroll(page, "/apps (empty)");

  // The recent-activity banner should render in mobile-collapsed form (single line "N recent events · ...")
  // and the desktop "Recent activity" heading should NOT be visible at 375px.
  await expect(page.getByText(/recent event/i).first()).toBeVisible();
  await expect(page.getByText("Recent activity")).not.toBeVisible();

  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/users");

  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/audit");

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/account");
});

test("mobile (375px): no horizontal scroll across app sub-routes", async ({ page }) => {
  await login(page);

  // Create a fresh "mobile" app so the test is self-contained.
  await page.getByRole("link", { name: /create your first app|new app/i }).first().click();
  await expect(page).toHaveURL(/\/apps\/new$/);
  await assertNoHorizontalScroll(page, "/apps/new");

  const triggers = page.getByRole("combobox");
  await triggers.nth(0).click();
  await page.getByRole("option", { name: "smoke-org" }).click();
  await triggers.nth(1).click();
  await page.getByRole("option", { name: "smoke-org/hello" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#slug").fill("mobile");
  await page.getByRole("button", { name: "Create app" }).click();
  await expect(page).toHaveURL(/\/apps\/mobile$/);
  await assertNoHorizontalScroll(page, "/apps/mobile (overview)");

  // Visit each sub-route.
  for (const tab of ["deployments", "env", "domains", "volumes", "settings", "shell"]) {
    await page.goto(`/apps/mobile/${tab}`);
    await expect(page.getByRole("heading", { name: /Deployments|Environment variables|Domains|Volumes|Settings|Shell/ }).first()).toBeVisible();
    await assertNoHorizontalScroll(page, `/apps/mobile/${tab}`);
  }
});
