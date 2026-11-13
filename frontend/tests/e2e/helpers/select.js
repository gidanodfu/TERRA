import { expect } from '@playwright/test'

export async function selectOption(page, label, option) {
  const trigger = page.getByRole('combobox', { name: label })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
