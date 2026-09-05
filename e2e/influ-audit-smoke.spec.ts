import { expect, type Page, test } from "@playwright/test";

/**
 * Smoke test เฉพาะส่วนที่ audit 2026-09-03 แก้ (migration 0106-0111) — ตั้งใจให้เล็ก
 * ไม่ซ้ำกับ ui-sweep ที่กวาดทั้งระบบ (ผู้ใช้: "เทสแบบไม่ต้องเยอะ ยังเป็นช่วงเทส")
 *
 * เช็คแค่ว่า "หน้าที่แก้ยังเปิดได้และมีของที่ควรมี" — ไม่กด mutation ใดๆ
 * เพราะ dev ชี้ DB production (กติกาเดียวกับ ui-sweep)
 *
 * ต้องตั้ง env: E2E_EMAIL / E2E_PASSWORD
 */

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.use({ actionTimeout: 30_000 });

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "commit" });
  await page.waitForTimeout(1200);
  const password = page.locator('input[type="password"]').first();
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
  await page.waitForURL("**/start", { timeout: 30_000, waitUntil: "commit" });
}

test("หน้าที่แก้ใน audit ยังเปิดได้ครบ", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "ต้องตั้ง E2E_EMAIL / E2E_PASSWORD ก่อน");
  await login(page);

  // 1) บอร์ดเคส — ต้องมีปุ่มตัวกรอง + ปุ่มสร้างนัดใหม่ (ชื่อไทยที่ e2e ทั้งระบบใช้จับ)
  await page.goto("/influencers", { waitUntil: "commit" });
  await expect(
    page.getByRole("button", { name: "ตัวกรอง" }).first()
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "สร้างนัดใหม่" }).first()
  ).toBeVisible();

  // 2) โมดัลสร้างนัด — 4 ส่วนมีเลข + มีเช็คลิสต์ผู้รับผิดชอบครบ 4 แถว (0108)
  await page.getByRole("button", { name: "สร้างนัดใหม่" }).first().click();
  await expect(page.getByText("โปรไฟล์ Influencer", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("ผู้รับผิดชอบเคส", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("4. ผู้เกี่ยวข้อง", { exact: false }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // 3) หน้าจัดการโปรไฟล์ใหม่ (0111) — ต้องมีลิสต์โปรไฟล์ทั้งหมด
  await page.goto("/influencer-management/profiles", { waitUntil: "commit" });
  await expect(
    page.getByText("โปรไฟล์ทั้งหมด", { exact: false }).first()
  ).toBeVisible({ timeout: 30_000 });

  // 4) ถังขยะ + Log ยังเปิดได้ (RLS ถูกบีบที่ 0106 — ผู้ดูแลต้องยังอ่านได้)
  await page.goto("/influencer-management/trash", { waitUntil: "commit" });
  await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  await page.goto("/influencer-management/logs", { waitUntil: "commit" });
  await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });

  // 5) หน้า Follow Up + ปฏิทิน (ตัวกรองถูกแก้ทั้งคู่)
  await page.goto("/influencers/contracts", { waitUntil: "commit" });
  await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  await page.goto("/influ-calendar", { waitUntil: "commit" });
  await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
});
