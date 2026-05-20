/**
 * End-to-end happy path:
 *   browse  →  event detail  →  sign in  →  checkout  →  (synthesize payment)  →  success
 *
 * We bypass Stripe's hosted checkout intentionally. Stripe tests their own UI;
 * we test ours. The backend exposes POST /test/complete-order/{id} when
 * TEST_MODE=true, which performs the same post-payment work the real webhook
 * does. Playwright intercepts the redirect to checkout.stripe.com, calls that
 * endpoint, then navigates to /checkout/success.
 *
 * Prerequisites:
 *   - LocalStack running          (docker compose up -d)
 *   - Backend with TEST_MODE=true (TEST_MODE=true uvicorn app.main:app --reload)
 *   - SQS worker (optional)       (python -m worker.run_local)
 */

import { test, expect, type Page } from "@playwright/test"

const API = "http://localhost:8000"

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies()
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
})

async function signInAs(page: Page, email: string) {
  await page.goto("/login")
  await page.getByPlaceholder("Email").fill(email)
  await page.getByPlaceholder("Password").fill("test1234")
  await page.getByRole("button", { name: /login/i }).click()
  await expect(page).toHaveURL("/")
}

test("browse → buy → land on success", async ({ page, request }) => {
  await signInAs(page, "e2e@example.com")

  // Intercept POST /orders to capture the order_id BEFORE the frontend
  // redirects to Stripe (otherwise the browser tears down network resources
  // mid-redirect and response.json() races). We re-fulfill with the original
  // body so the frontend behaves normally; then we abort the Stripe nav.
  let capturedOrderId: string | null = null
  await page.route(`${API}/orders`, async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    const response = await route.fetch()
    const text = await response.text()
    capturedOrderId = JSON.parse(text).order_id
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: text,
    })
  })
  await page.route("https://checkout.stripe.com/**", (route) => route.abort())

  // 1. Browse and pick an event.
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /find your next event/i })).toBeVisible()
  await page.locator('a[href^="/events/"]').first().click()

  // 2. Event detail → checkout.
  await page.getByRole("link", { name: /select ticket/i }).click()
  await expect(page).toHaveURL(/\/checkout\?eventId=/)

  // 3. Submit. The frontend will POST /orders then attempt to redirect to
  //    Stripe — we abort that navigation in the route handler above.
  await page.getByRole("button", { name: /continue to payment/i }).click()

  // 4. Wait until we captured the order_id from the API response.
  await expect.poll(() => capturedOrderId, { timeout: 10_000 }).not.toBeNull()

  // 5. Synthesize a successful payment via the test endpoint.
  const complete = await request.post(`${API}/test/complete-order/${capturedOrderId}`)
  expect(complete.ok()).toBeTruthy()
  const completeBody = await complete.json()
  expect(completeBody.status).toBe("paid")

  // 6. Navigate to the success page as Stripe would have done.
  await page.goto(`/checkout/success?order_id=${capturedOrderId}`)

  // 7. The success page polls /orders/{id} until status is "paid".
  await expect(
    page.getByRole("heading", { name: /payment successful/i })
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(`text=${capturedOrderId}`)).toBeVisible()
})
