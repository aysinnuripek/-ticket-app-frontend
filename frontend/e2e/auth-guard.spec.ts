import { test, expect } from "@playwright/test"

test.beforeEach(async ({ context, page }) => {
  // Wipe the fake auth between tests so each spec starts signed out.
  // Use a one-time evaluate (NOT addInitScript) so localStorage survives
  // subsequent navigations during the test itself.
  await context.clearCookies()
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
})

test("My Tickets redirects to login when signed out", async ({ page }) => {
  await page.goto("/my-tickets")
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible()
})

test("Admin redirects to login when signed out", async ({ page }) => {
  await page.goto("/admin")
  await expect(page).toHaveURL(/\/login/)
})

test("login rejects empty fields", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("button", { name: /login/i }).click()
  await expect(page.getByText(/email and password are required/i)).toBeVisible()
})

test("login + persistence: navigating away keeps you signed in", async ({ page }) => {
  await page.goto("/login")
  await page.getByPlaceholder("Email").fill("e2e@example.com")
  await page.getByPlaceholder("Password").fill("test1234")
  await page.getByRole("button", { name: /login/i }).click()

  // After login, we land on / (no `from` state on a direct /login visit).
  await expect(page).toHaveURL("/")

  // Now /my-tickets should be reachable without bouncing to /login.
  await page.goto("/my-tickets")
  await expect(page).toHaveURL(/\/my-tickets/)
  await expect(page.getByRole("heading", { name: /my tickets/i })).toBeVisible()
})
