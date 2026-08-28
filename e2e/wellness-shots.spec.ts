import { expect, type Page, test } from "@playwright/test";

/**
 * ช็อตเฉพาะระบบ Wellness — ใช้ตรวจดีไซน์เร็วๆ ระหว่างแก้ UI (สเปกย่อยของ ui-sweep:
 * ล็อกอินแล้วไล่ถ่ายทุกหน้า wellness + เปิดโมดัลของปฏิทิน) — เก็บไว้ใช้ประจำ:
 * `npx playwright test wellness-shots` เร็วกว่า sweep เต็มมาก เหมาะกับรอบแก้ดีไซน์
 */

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

const PAGES: { path: string; name: string }[] = [
  { path: "/wellness", name: "w-home" },
  { path: "/wellness-register", name: "w-register" },
  { path: "/wellness-lab", name: "w-lab" },
  { path: "/wellness-booking", name: "w-booking" },
  { path: "/wellness-clinic", name: "w-clinic" },
  { path: "/wellness-cases", name: "w-cases" },
  { path: "/wellness-calendar", name: "w-calendar" },
];

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1200); // รอ hydration — fill ก่อน React พร้อมจะถูกเคลียร์ทิ้ง
  const password = page.locator('input[type="password"]').first();
  // ขั้นอีเมลอาจแพ้ hydration race — ลองซ้ำจนช่องรหัสผ่านโผล่
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator("form input").first().fill(EMAIL);
    await page.getByRole("button", { name: "ถัดไป" }).click();
    try {
      await password.waitFor({ state: "visible", timeout: 8_000 });
      break;
    } catch {
      // ยังไม่ขึ้น — วนกรอกใหม่
    }
  }
  await password.waitFor({ state: "visible", timeout: 15_000 });
  await password.fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  try {
    await page.waitForURL("**/start", { timeout: 60_000, waitUntil: "commit" });
  } catch {
    if (page.url().includes("/login")) {
      await page.locator('form button[type="submit"]').click();
    }
    await page.waitForURL("**/start", { timeout: 60_000, waitUntil: "commit" });
  }
}

test("wellness screenshots", async ({ page }, testInfo) => {
  test.skip(!EMAIL || !PASSWORD, "ตั้ง E2E_EMAIL / E2E_PASSWORD ก่อนรัน");
  const project = testInfo.project.name;
  await login(page);

  let seq = 0;
  const shot = (name: string) =>
    `e2e/screenshots/wellness/${project}/${String(++seq).padStart(2, "0")}-${name}.png`;

  for (const p of PAGES) {
    await page.goto(p.path, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(1500);
    await expect(
      page.getByText("This page could not be found"),
      `${p.path}: 404`
    ).toHaveCount(0);
    await page.screenshot({ path: shot(p.name), fullPage: true });
    const ox = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(ox, `${p.path}: ล้นแนวนอน ${ox}px`).toBeLessThanOrEqual(2);
  }

  // ปฏิทิน: เปิดการ์ดคิวใบแรก → โมดัลรายละเอียด
  const row = page.locator('button[aria-label^="ดูรายละเอียดคิว"]').first();
  if ((await row.count()) > 0) {
    await row.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot("w-appt-detail") });
    await page.keyboard.press("Escape");
  }
});
