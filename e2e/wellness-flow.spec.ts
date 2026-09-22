import { expect, type Page, test } from "@playwright/test";

/**
 * E2E "เดินทั้ง flow" ของระบบ Wellness — จำลองลูกค้า 1 คนตั้งแต่ต้นจนจบ:
 *
 *   ① BC กรอกการ์ดหลังลูกค้าตรวจเลือด  → เคสโผล่กอง "รอผลแลบ"
 *   ② Lab อัพไฟล์ผล + กดยืนยันผลครบ    → เคสเลื่อนเป็น "ผลพร้อม · รอนัด"
 *   ③ Admin เห็นคิวรอโทรนัด (เบอร์ + ปุ่มโทร) → ลงคิววันที่แพทย์เข้า (อังคาร/เสาร์)
 *   ④ คิวโผล่บนปฏิทินลงคิว + หน้าคิวตรวจของแพทย์
 *   ⑤ ลบเคสทดสอบทิ้ง (ไฟล์ใน storage + คิว cascade ตามไปเอง)
 *
 * ⚠️ **สเปกนี้เขียนข้อมูลจริงลง DB โปรดักชัน** (dev server ชี้ Supabase ตัวเดียวกัน) —
 * ต่างจาก ui-sweep ที่เปิด/ปิดอย่างเดียว จึงต้อง:
 *   - ตั้งชื่อขึ้นต้นด้วย E2E_PREFIX เสมอ เห็นแล้วรู้ทันทีว่าเป็นของเทสต์
 *   - ลบเคสทิ้งใน finally ทุกกรณี (ล้มกลางทางก็ยังลบ) — ห้ามทิ้งขยะไว้ในระบบจริง
 *   - ใช้บัญชี E2E ที่มีสิทธิ์ wellness ครบ (claude.qa)
 *
 * รัน: npx playwright test wellness-flow --project=mobile
 */

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

/** ชื่อ/หัตถการของเคสทดสอบ — มี timestamp กันชนกับรอบก่อนที่อาจลบไม่สำเร็จ */
const STAMP = String(Date.now()).slice(-6);
const FIRST = `E2E ทดสอบ${STAMP}`;
const LAST = "ลบได้";
const FULL = `${FIRST} ${LAST}`;
const PHONE = "099-000-0000";
const PROCEDURE = "เสริมจมูก (เคสทดสอบระบบ ลบได้)";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1200); // รอ hydration — fill ก่อน React พร้อมจะถูกเคลียร์
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
  await page.waitForURL("**/start", { timeout: 60_000, waitUntil: "commit" });
}

/** ทุก action มี timeout — ไม่งั้น locator ที่ไม่มีวันเจอจะรอเงียบๆ จนหมดเวลาทั้งเทสต์
    (บทเรียนรอบแรก: กดช่องวันที่อยู่คนละเดือน แล้วค้างยาว 4 นาทีโดยไม่บอกว่าติดตรงไหน) */
test.use({ actionTimeout: 20_000 });

async function goto(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(1200);
  await expect(
    page.getByText("This page could not be found"),
    `${path}: 404`
  ).toHaveCount(0);
}

/** กดเลือกวันบนปฏิทิน — เลื่อนเดือนไปข้างหน้าให้เองถ้าวันนั้นอยู่เดือนถัดไป
    (ช่องวันมี aria-label เป็น ISO เต็ม จึงเช็คได้ว่าเดือนที่โชว์อยู่มีวันนั้นไหม) */
async function openDay(page: Page, day: string) {
  const cell = page.locator(`button[aria-label="เปิดคิววันที่ ${day}"]`);
  for (let hop = 0; hop < 3; hop++) {
    if ((await cell.count()) > 0) break;
    await page.getByRole("button", { name: "เดือนถัดไป" }).click();
    await page.waitForTimeout(400);
  }
  await expect(cell, `ปฏิทินต้องมีช่องวันที่ ${day}`).toBeVisible({
    timeout: 10_000,
  });
  await cell.click();
  await page.waitForTimeout(400);
}

/** วันแพทย์เข้าถัดไป (อังคาร/เสาร์) เป็น YYYY-MM-DD ตามเวลาไทย — ใช้ลงคิวให้ตรงวันจริง */
function nextDoctorDay(): string {
  const bkkNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  for (let i = 1; i <= 14; i++) {
    const d = new Date(bkkNow);
    d.setUTCDate(d.getUTCDate() + i);
    const dow = d.getUTCDay();
    if (dow === 2 || dow === 6) return d.toISOString().slice(0, 10);
  }
  throw new Error("หา วันอังคาร/เสาร์ ใน 14 วันข้างหน้าไม่เจอ (เป็นไปไม่ได้)");
}

test("flow ครบวงจร: BC → Lab → Admin ลงคิว → คิวตรวจของแพทย์", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "ตั้ง E2E_EMAIL / E2E_PASSWORD ก่อนรัน");
  test.setTimeout(240_000);

  await login(page);
  let created = false;

  try {
    /* ---------- ① BC: กรอกการ์ดลูกค้าหลังตรวจเลือด ---------- */
    await goto(page, "/wellness/register");
    await page.getByRole("button", { name: "เพิ่มการ์ดลูกค้า" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("ชื่อ *").fill(FIRST);
    await modal.getByLabel("นามสกุล").fill(LAST);
    await modal.getByLabel("เบอร์โทร").fill(PHONE);
    await modal.getByLabel("หัตถการที่ทำ").fill(PROCEDURE);
    await modal.getByRole("button", { name: "สร้างการ์ด" }).click();
    created = true;

    // การ์ดใหม่ต้องโผล่ในทะเบียนพร้อมสถานะ "รอผลแลบ"
    const registerRow = page.locator("li", { hasText: FULL }).first();
    await expect(registerRow, "① การ์ดที่ BC สร้างต้องขึ้นในทะเบียน").toBeVisible({
      timeout: 20_000,
    });
    await expect(
      registerRow.getByText("รอผลแลบ"),
      "① เคสใหม่ต้องเริ่มที่สถานะ รอผลแลบ"
    ).toBeVisible();

    /* ---------- ② Lab: อัพไฟล์ผลเลือด + ยืนยันผลครบ ---------- */
    await goto(page, "/wellness/lab");
    const labCard = page.locator("section", { hasText: FULL }).last();
    await expect(labCard, "② เคสต้องเข้าคิวของทีม Lab").toBeVisible({
      timeout: 20_000,
    });

    // ปุ่มยืนยันต้องยังกดไม่ได้ตราบใดที่ยังไม่มีไฟล์
    const confirmBtn = labCard.getByRole("button", { name: "ยืนยันผลครบ" });
    await expect(
      confirmBtn,
      "② ห้ามยืนยันผลได้ถ้ายังไม่มีไฟล์แนบ"
    ).toBeDisabled();

    // อัพไฟล์ผ่าน input[type=file] ที่ซ่อนอยู่ (ไฟล์ PDF ปลอมเล็กๆ)
    await labCard.locator('input[type="file"]').setInputFiles({
      name: `e2e-lab-${STAMP}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% e2e wellness flow test\n"),
    });
    // รอ "แถวไฟล์ที่บันทึกลง DB แล้ว" ไม่ใช่แค่ชื่อไฟล์ — ระหว่างอัพโหลด แผงไฟล์ก็โชว์
    // ชื่อไฟล์ในบรรทัด "กำลังอัพโหลด ..." เหมือนกัน จับชื่อเฉยๆ จะผ่านตั้งแต่ยังอัพไม่เสร็จ
    // แล้วไปตกที่ปุ่มยืนยันซึ่งยัง disabled อยู่ (ปุ่มปลดล็อกเมื่อ lab_files มีแถวจริง)
    await expect(
      labCard.getByRole("button", { name: `ลบไฟล์ e2e-lab-${STAMP}.pdf` }),
      "② ไฟล์ผลเลือดต้องขึ้นในรายการหลังอัพเสร็จ"
    ).toBeVisible({ timeout: 60_000 });

    await expect(confirmBtn, "② มีไฟล์แล้วปุ่มยืนยันต้องกดได้").toBeEnabled();
    // ต้องรอ "คำขอบันทึกถึง DB จริง" ก่อนเดินหน้าต่อ — หน้า Lab ย้ายการ์ดไปกอง
    // "ยืนยันแล้ว" แบบ optimistic ตั้งแต่ยังไม่ได้คำตอบ ถ้ารีบ goto หน้าถัดไป
    // คำขอที่ค้างอยู่จะถูกยกเลิกกลางทาง = ผลแลบไม่เคยถูกยืนยันจริง
    // (บั๊กของสเปกเอง: รอบก่อนเช็คแค่หัวข้อกอง ซึ่งมีอยู่แล้วจากเคส demo เลยผ่านทั้งที่ยังไม่บันทึก)
    const confirmSaved = page.waitForResponse(
      (r) =>
        r.url().includes("/rest/v1/wellness_customers") &&
        r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await confirmBtn.click();
    const confirmRes = await confirmSaved;
    expect(
      confirmRes.status(),
      "② คำขอยืนยันผลแลบต้องบันทึกสำเร็จ"
    ).toBeLessThan(300);
    await expect(
      page.getByText("ยืนยันแล้ว · รอ Admin นัด"),
      "② ยืนยันแล้วเคสต้องย้ายไปกอง 'รอ Admin นัด'"
    ).toBeVisible({ timeout: 20_000 });

    /* ---------- ③ Admin: เห็นในคิวรอโทรนัด แล้วลงคิว ---------- */
    await goto(page, "/wellness/contact");
    const contactRow = page.locator("li", { hasText: FULL }).first();
    await expect(
      contactRow,
      "③ ผลพร้อมแล้วต้องโผล่ในหน้า 'ข้อมูลติดต่อ' ให้ Admin โทร"
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      contactRow.getByRole("link", { name: PHONE }),
      "③ ต้องมีปุ่มโทรพร้อมเบอร์ลูกค้า"
    ).toBeVisible();

    // ลงคิวจากหน้าปฏิทิน (วันแพทย์เข้าถัดไป)
    const day = nextDoctorDay();
    await goto(page, "/wellness/calendar");
    await openDay(page, day);
    await page.getByRole("button", { name: /ลงคิว/ }).first().click();

    const bookModal = page.getByRole("dialog");
    await expect(bookModal, "③ โมดัลลงคิวต้องเปิด").toBeVisible();
    // ตัวเลือกลูกค้าต้องมีเฉพาะคนที่ผลแลบยืนยันแล้ว — เคสนี้ต้องอยู่ในลิสต์
    await bookModal.getByPlaceholder("ค้นหา").fill(FIRST);
    const pick = bookModal.locator(`button[aria-label^="เลือกลูกค้า ${FIRST}"]`);
    await expect(
      pick,
      "③ ลูกค้าที่ผลแลบพร้อมต้องเลือกได้ในฟอร์มลงคิว"
    ).toBeVisible({ timeout: 10_000 });
    await pick.click();

    await bookModal.getByLabel("เวลาเริ่ม *").fill("15:00");
    await bookModal.getByRole("button", { name: /^ลงคิว 15:00/ }).click();
    await expect(bookModal, "③ ลงคิวสำเร็จโมดัลต้องปิด").toBeHidden({
      timeout: 30_000,
    });

    /* ---------- ④ คิวต้องโผล่บนปฏิทิน + หน้าคิวตรวจของแพทย์ ---------- */
    await expect(
      page.locator(`button[aria-label^="ดูรายละเอียดคิว 15:00 ${FIRST}"]`),
      "④ คิวใหม่ต้องขึ้นบนปฏิทินลงคิวของ Admin"
    ).toBeVisible({ timeout: 20_000 });

    await goto(page, "/wellness/clinic");
    await openDay(page, day);
    await expect(
      page.locator(`button[aria-label^="ดูรายละเอียดคิว 15:00 ${FIRST}"]`),
      "④ หมอต้องเห็นคิวเดียวกันในหน้าคิวตรวจ (ปฏิทินอ่านอย่างเดียว)"
    ).toBeVisible({ timeout: 20_000 });

    // หน้าคิวตรวจของหมอห้ามมีปุ่มลงคิว
    await expect(
      page.getByRole("button", { name: "ลงคิวในวันที่เลือก" }),
      "④ หน้าคิวตรวจของแพทย์ต้องไม่มีปุ่มลงคิว"
    ).toHaveCount(0);

    /* ---------- ⑤ เคสต้องขึ้นสถานะ 'นัดแล้ว' ในภาพรวม ---------- */
    await goto(page, "/wellness/cases");
    const caseRow = page.locator("li", { hasText: FULL }).first();
    await expect(
      caseRow.getByText("นัดแล้ว").first(),
      "⑤ ภาพรวมเคสต้องเลื่อนสถานะเป็น 'นัดแล้ว' เอง"
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    /* ---------- เก็บกวาด: ลบเคสทดสอบเสมอ แม้เทสต์ล้มกลางทาง ---------- */
    if (created) {
      await goto(page, "/wellness/cases");
      const link = page.locator(`a[aria-label="เปิดเคสของ ${FULL}"]`).first();
      if ((await link.count()) > 0) {
        await link.click();
        await page.waitForURL("**/wellness/**", { timeout: 30_000 });
        await page.getByRole("button", { name: "ลบการ์ด" }).click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "ลบการ์ด" })
          .click();
        await page.waitForTimeout(2500);
        await goto(page, "/wellness/cases");
        await expect(
          page.locator(`a[aria-label="เปิดเคสของ ${FULL}"]`),
          "⑤ เคสทดสอบต้องถูกลบออกจากระบบจริงเรียบร้อย"
        ).toHaveCount(0);
      }
    }
  }
});
