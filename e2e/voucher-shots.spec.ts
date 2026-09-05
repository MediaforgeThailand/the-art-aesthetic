import { expect, test, type Page } from "@playwright/test";

/**
 * ตรวจระบบเปิดวงเงิน voucher (migration 0106) + ตัวเลือกหัตถการแบบ dropdown +
 * หมายเหตุ "แบรนด์ support" ในเอกสาร Memo — ด้วยตา + assert สูตรมูลค่า
 * รันด้วย: npx playwright test e2e/voucher-shots.spec.ts   (ต้องตั้ง E2E_EMAIL / E2E_PASSWORD)
 *
 * ⚠️ **ห้ามกด "บันทึกการแก้ไข"** — dev ชี้ DB โปรดักชัน (กติกาเดียวกับ ui-sweep)
 * เทสต์นี้แตะแค่ state ฝั่ง client: กดปุ่ม/กรอกช่องแล้วดูว่ายอดรวม/ข้อความคำนวณถูก
 */
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

/** เคสที่อยู่ขั้น Memo — มีทั้งแท็บรายละเอียดเคสและขั้น Memo ให้ดู */
const CASE_ID = process.env.E2E_CASE_ID ?? "4fe1ef0b-b6c1-4e67-8915-24f7ba14d136";
/** เคสที่มีรายการติ๊ก "แบรนด์ support" ไว้แล้วจริงในฐาน — ใช้ตรวจบรรทัดหมายเหตุใน Memo */
const SUPPORT_CASE_ID =
  process.env.E2E_SUPPORT_CASE_ID ?? "54a05552-bcd4-42d6-9313-f0cddeb83717";

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

/** แท็บ "รายละเอียดเคส" — ชื่อเต็มบนจอกว้าง / ป้ายสั้น "รายละเอียด" บนจอเล็ก (sm:hidden)
    ⚠️ ต้องยึดชื่อแบบเต็มรูป (regex ปิดหัวท้าย) เพราะค่าปริยายของ Playwright คือ
    "ชื่อมีคำนี้อยู่" ซึ่งไปตรงกับปุ่มในลิสต์ "การแก้ไขล่าสุด" ("แก้ไข แก้รายละเอียดเคส (…)")
    ที่อยู่ก่อนแท็บใน DOM */
async function openDetailTab(page: Page) {
  const tab = page.getByRole("button", { name: /^รายละเอียด(เคส)?$/ }).first();
  await tab.waitFor({ state: "visible", timeout: 120_000 });
  // dev server compile ช้า — กดก่อน hydration แล้ว onClick ไม่ทำงาน (คลิกเงียบๆ ไม่ error)
  // จึงกดซ้ำจนแท็บสลับจริง แทนที่จะกดครั้งเดียวแล้วรอยาว
  for (let i = 0; i < 20; i++) {
    if (await page.getByLabel(/^จำนวน Voucher/).isVisible().catch(() => false))
      return;
    await tab.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page
    .getByLabel(/^จำนวน Voucher/)
    .waitFor({ state: "visible", timeout: 30_000 });
}

test("วงเงิน voucher — ช่องกรอกจำนวน + มูลค่ารวม", async ({ page }, info) => {
  test.skip(!EMAIL || !PASSWORD, "ตั้ง E2E_EMAIL / E2E_PASSWORD ก่อนรัน");
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await login(page);

  await page.goto(`/influencers/${CASE_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await openDetailTab(page);
  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-empty.png`,
    fullPage: true,
  });

  // ช่องกรอกจำนวนเป็น <Input type="number"> ล้วน — ไม่มีปุ่มลัด/ตัวเพิ่มลดอีกแล้ว (2026-09-03)
  const countInput = page.getByLabel(/^จำนวน Voucher/);
  await countInput.fill("5");
  await expect(countInput).toHaveValue("5");
  // ยอด "= ฿50,000" โผล่ข้างช่องทันทีที่กรอก
  await expect(page.getByText("= ฿50,000")).toBeVisible();

  // มูลค่าเคสรวมต้องโชว์ breakdown "Voucher 10,000 × 5 = 50,000 บาท" ไม่ใช่ยอดราคาสินค้า
  await expect(
    page.getByText(/Voucher\s*10,000\s*×\s*5\s*=\s*50,000\s*บาท/)
  ).toBeVisible();

  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-picked.png`,
    fullPage: true,
  });

  /* --- ตัวเลือกหัตถการเปลี่ยนเป็น dropdown ปิดโดยปริยาย (2026-09-03) --- */
  const addProcedureBtn = page
    .getByRole("button", { name: /^\+ เพิ่มหัตถการ/ })
    .first();
  await expect(addProcedureBtn).toBeVisible();
  await addProcedureBtn.click();
  const searchBox = page.getByPlaceholder(/พิมพ์ค้นหาจาก Price List หรือชื่อใหม่/);
  await expect(searchBox).toBeVisible();
  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-dropdown-open.png`,
  });
  await page.keyboard.press("Escape");
  await expect(searchBox).toBeHidden();

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

test("Memo แสดงหมายเหตุรายการแบรนด์ support", async ({ page }, info) => {
  test.skip(!EMAIL || !PASSWORD, "ตั้ง E2E_EMAIL / E2E_PASSWORD ก่อนรัน");
  await login(page);

  await page.goto(`/influencers/${SUPPORT_CASE_ID}?view=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  const detailBox = page.getByText("จึงเรียนมาเพื่อพิจารณาอนุมัติ").first();
  await detailBox.waitFor({ state: "visible", timeout: 120_000 });
  const memoText = (await detailBox.textContent()) ?? "";
  console.log("memo detail (support case):\n", memoText);
  expect(memoText).toContain("หมายเหตุ :");
  expect(memoText).toContain("แบรนด์ support");
  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-support-note.png`,
    fullPage: true,
  });
});

test("สร้างนัดใหม่ — dropdown หัตถการ + วงเงิน voucher ในโมดัล (z-index ไม่ถูกบัง)", async ({
  page,
}, info) => {
  test.skip(!EMAIL || !PASSWORD, "ตั้ง E2E_EMAIL / E2E_PASSWORD ก่อนรัน");
  await login(page);

  await page.goto("/influencers", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  const createBtn = page.getByRole("button", { name: "สร้างนัดใหม่" }).first();
  await createBtn.waitFor({ state: "visible", timeout: 120_000 });
  for (let i = 0; i < 20; i++) {
    if (await page.getByLabel(/^จำนวน Voucher/).isVisible().catch(() => false))
      break;
    await createBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  await expect(page.getByLabel(/^จำนวน Voucher/)).toBeVisible({ timeout: 30_000 });

  // dropdown หัตถการต้องเปิดทับตัวโมดัล (z-[80]) ได้จริง ไม่ถูกโมดัลบัง — ปุ่มนี้เป็นชื่อ
  // เต็มรูป "+ เพิ่มหัตถการจาก Price List..." เฉพาะทีม aesthetics (ค่าตั้งต้นของฟอร์ม)
  const addProcedureBtn = page
    .getByRole("button", { name: /^\+ เพิ่มหัตถการ/ })
    .first();
  await addProcedureBtn.click();
  const searchBox = page.getByPlaceholder(/พิมพ์ค้นหาจาก Price List หรือชื่อใหม่/);
  await expect(searchBox).toBeVisible();
  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-new-case-dropdown.png`,
  });
  await page.keyboard.press("Escape");
  await expect(searchBox).toBeHidden();

  // กรอกจำนวน voucher แล้วดูว่ามูลค่าเคสรวมอัพเดทตาม (ไม่กดสร้างจริง)
  await page.getByLabel(/^จำนวน Voucher/).fill("3");
  await expect(page.getByText(/Voucher\s*10,000\s*×\s*3\s*=\s*30,000\s*บาท/)).toBeVisible();
  await page.screenshot({
    path: `e2e/screenshots/voucher-${info.project.name}-new-case-filled.png`,
  });

  // ปิดโมดัลโดยไม่กดสร้างนัด — ห้ามบันทึกข้อมูลจริงลง DB โปรดักชัน
  await page.keyboard.press("Escape");
});
