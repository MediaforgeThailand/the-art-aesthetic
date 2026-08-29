import { expect, test, type Page } from "@playwright/test";

/**
 * ถ่ายรูปกระดิ่งแจ้งเตือนหลัง upgrade (2026-08-29) + assert ว่าตัวเลขดับทันทีที่เปิดแผง
 * รันด้วย: npx playwright test e2e/noti-shots.spec.ts   (ต้องตั้ง E2E_EMAIL / E2E_PASSWORD)
 */
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.use({ actionTimeout: 20_000 });

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
  const email = page.locator("#email");
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ state: "visible", timeout: 120_000 });
  // dev server compile ช้า — ค่าที่กรอกก่อน hydration ถูก React ล้างทิ้ง (ฟอร์มเด้ง
  // "รูปแบบอีเมลไม่ถูกต้อง" หรือปุ่มค้าง disabled) จึงกรอกใหม่+ตรวจค่าจริงทุกรอบก่อนกด
  for (let i = 0; i < 12; i++) {
    if (await password.isVisible().catch(() => false)) break;
    await email.fill("");
    await email.fill(EMAIL);
    if ((await email.inputValue()) !== EMAIL) {
      await page.waitForTimeout(2000);
      continue;
    }
    await page
      .getByRole("button", { name: "ถัดไป" })
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(2500);
  }
  await password.waitFor({ state: "visible", timeout: 30_000 });
  await password.fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL("**/start", { timeout: 120_000, waitUntil: "commit" });
}

test("กระดิ่งแจ้งเตือน", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await login(page);
  await page.goto("/tasks", { waitUntil: "domcontentloaded", timeout: 120_000 });
  const bell = page.getByRole("button", { name: /การแจ้งเตือน/ }).first();
  await bell.waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: `e2e/screenshots/noti-${info.project.name}-closed.png`,
  });
  await bell.click();
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: `e2e/screenshots/noti-${info.project.name}-open.png`,
  });
  await expect(page.getByText("การแจ้งเตือน", { exact: true })).toBeVisible();
  // เปิดแผง = ตัวเลขบนกระดิ่งต้องดับทันที (ไม่ต้องกด "อ่านทั้งหมด")
  await expect(bell).toHaveAttribute("aria-label", "การแจ้งเตือน");
  console.log("console errors:", errors.slice(0, 5));
});
