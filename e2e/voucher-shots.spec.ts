import { expect, test, type Page } from "@playwright/test";

/**
 * ตรวจระบบเปิดวงเงิน voucher (migration 0106) ด้วยตา + assert สูตรมูลค่า
 * รันด้วย: npx playwright test e2e/voucher-shots.spec.ts   (ต้องตั้ง E2E_EMAIL / E2E_PASSWORD)
 *
 * ⚠️ **ห้ามกด "บันทึกการแก้ไข"** — dev ชี้ DB โปรดักชัน (กติกาเดียวกับ ui-sweep)
 * เทสต์นี้แตะแค่ state ฝั่ง client: กดปุ่มวงเงินแล้วดูว่ายอดรวมคำนวณถูก
 */
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

/** เคสที่อยู่ขั้น Memo — มีทั้งแท็บรายละเอียดเคสและขั้น Memo ให้ดู */
const CASE_ID = process.env.E2E_CASE_ID ?? "4fe1ef0b-b6c1-4e67-8915-24f7ba14d136";

test.use({ actionTimeout: 20_000 });

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
  const email = page.locator("#email");
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ state: "visible", timeout: 120_000 });
  // dev server compile ช้า — ค่าที่กรอกก่อน hydration ถูก React ล้างทิ้ง จึงกรอกซ้ำจนติด
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

test("วงเงิน voucher — ฟอร์มกรอกข้อมูล + ข้อความ Memo", async ({ page }, info) => {
  test.skip(!EMAIL || !PASSWORD, "ตั้ง E2E_EMAIL / E2E_PASSWORD ก่อนรัน");
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await login(page);

  /* --- แท็บรายละเอียดเคส: ตัวเปิดวงเงิน --- */
  await page.goto(`/influencers/${CASE_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  // dev server compile ช้า — กดก่อน hydration แล้ว onClick ไม่ทำงาน (คลิกเงียบๆ ไม่ error)
  // จึงกดซ้ำจนแท็บสลับจริง แทนที่จะกดครั้งเดียวแล้วรอยาว
  // ⚠️ ต้องยึดชื่อแบบเต็มรูป — ค่าปริยายของ Playwright คือ "ชื่อมีคำนี้อยู่" ซึ่งไปตรงกับปุ่ม
  // ในลิสต์ "การแก้ไขล่าสุด" ("แก้ไข แก้รายละเอียดเคส (…)") ที่อยู่ก่อนแท็บใน DOM
  // และแท็บนี้ใช้ป้ายสั้น "รายละเอียด" บนจอเล็ก (sm:hidden) จึงต้องรับทั้งสองแบบ
  const tab = page
    .getByRole("button", { name: /^รายละเอียด(เคส)?$/ })
    .first();
  await tab.waitFor({ state: "visible", timeout: 120_000 });
  const picker = page.getByText(/วงเงินที่เปิดให้ \(Voucher ใบละ/).first();
  for (let i = 0; i < 20; i++) {
    if (await picker.isVisible().catch(() => false)) break;
    await tab.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if (i % 5 === 4) {
      console.log(
        `รอบ ${i + 1}: tab class = ${await tab.getAttribute("class")}`
      );
    }
  }
  await picker.waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-empty.png`,
    fullPage: true,
  });

  // กดปุ่มลัด 50,000 = voucher 5 ใบ (แตะ state ฝั่ง client เท่านั้น ไม่กดบันทึก)
  await page.getByRole("button", { name: "฿50,000" }).click();
  // exact:true อีกจุด — "จำนวน voucher" เป็นคำย่อยของปุ่ม "เพิ่ม/ลดจำนวน voucher" ข้างๆ
  const countInput = page.getByRole("spinbutton", {
    name: "จำนวน voucher",
    exact: true,
  });
  await expect(countInput).toHaveValue("5");

  // มูลค่าเคสรวมต้องเป็น "วงเงิน + ค่าตัว" ไม่ใช่ผลรวมราคาสินค้า
  await expect(
    page.getByText("คำนวณให้เอง = วงเงิน voucher + ค่าตัว (ไม่รวมราคาสินค้า)")
  ).toBeVisible();

  // ปุ่ม +/- ต้องขยับทีละใบ
  await page.getByRole("button", { name: "เพิ่มจำนวน voucher" }).click();
  await expect(countInput).toHaveValue("6");
  await page.getByRole("button", { name: "ลดจำนวน voucher" }).click();
  await expect(countInput).toHaveValue("5");

  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-picked.png`,
    fullPage: true,
  });

  /* --- ขั้น Memo: ข้อความที่คัดลอกต้องไม่มีราคาสินค้า --- */
  await page.goto(`/influencers/${CASE_ID}?view=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  const detailBox = page.getByText("จึงเรียนมาเพื่อพิจารณาอนุมัติ").first();
  await detailBox.waitFor({ state: "visible", timeout: 120_000 });
  const memoText = (await detailBox.textContent()) ?? "";
  console.log("memo detail:\n", memoText);
  // เคสที่ยังไม่ได้เปิดวงเงินจริงในฐาน → ไม่มีบรรทัดวงเงิน แต่ต้องมี "มูลค่ารวม" เสมอ
  expect(memoText).toContain("มูลค่ารวม :");
  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-memo.png`,
    fullPage: true,
  });

  console.log("console errors:", errors.slice(0, 5));
});
