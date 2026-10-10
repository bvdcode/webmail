import { expect, type Page } from "@playwright/test";

export async function openCalendarFromAccountMenu(page: Page): Promise<void> {
  const accountSwitcher = page.getByTestId("account-switcher");
  await expect(accountSwitcher).toBeVisible({ timeout: 30_000 });
  await accountSwitcher.click();

  const calendar = page.getByRole("menuitem", { name: /^calendar$/i });
  await expect(calendar).toBeVisible();
  await calendar.click();
}
