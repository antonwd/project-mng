import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 375, height: 800 } });

async function assertNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const html = document.documentElement;
    return { scroll: html.scrollWidth, client: html.clientWidth };
  });
  expect(overflow.scroll, `horizontal scroll on ${label} (${overflow.scroll} > ${overflow.client})`).toBeLessThanOrEqual(overflow.client);
}

test("mobile (375px): /apps, /apps/new, /apps/${slug} have no horizontal scroll", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Password + TOTP" }).click();
  const passwordTab = page.getByRole("tabpanel", { name: "Password + TOTP" });
  await passwordTab.locator("#email").fill("smoke@a.com");
  await passwordTab.locator("#password").fill("hunter2");
  await passwordTab.locator("#totp").fill("123456");
  await passwordTab.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole("heading", { name: "Apps", exact: true })).toBeVisible();
  await assertNoHorizontalScroll(page, "/apps");

  // Navigate to /apps/new via the empty-state CTA or the header New app button.
  await page.getByRole("link", { name: /create your first app|new app/i }).first().click();
  await expect(page).toHaveURL(/\/apps\/new$/);
  await assertNoHorizontalScroll(page, "/apps/new");

  // Create a fresh "mobile" app so the test is independent.
  const triggers = page.getByRole("combobox");
  await triggers.nth(0).click();
  await page.getByRole("option", { name: "smoke-org" }).click();
  await triggers.nth(1).click();
  await page.getByRole("option", { name: "smoke-org/hello" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Override the auto-derived "hello" slug to "mobile" so a second run doesn't collide.
  await page.locator("#slug").fill("mobile");
  await page.getByRole("button", { name: "Create app" }).click();

  await expect(page).toHaveURL(/\/apps\/mobile$/);
  await expect(page.getByRole("heading", { name: "mobile" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/apps/${slug}");
});
