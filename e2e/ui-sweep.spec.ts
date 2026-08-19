import { expect, type Page, test } from "@playwright/test";

/**
 * UI sweep ทั้งระบบ — ล็อกอินจริง เปิดทุกหน้า กดทุก feature หลัก (เปิด/ปิดเท่านั้น
 * ไม่บันทึกข้อมูล — DB ที่ dev ชี้อยู่คือ production) พร้อมถ่าย screenshot ทุกจุด
 * เก็บใน e2e/screenshots/{mobile|desktop}/ และ assert ว่าไม่มีเนื้อหาล้นจอแนวนอน
 *
 * ต้องตั้ง env: E2E_EMAIL / E2E_PASSWORD (บัญชีสิทธิ์ครบ + admin)
 */

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

const PAGES: { path: string; name: string }[] = [
  { path: "/dashboard", name: "dashboard" },
  { path: "/pricing", name: "pricing" },
  { path: "/influencers", name: "influencers" },
  { path: "/influ-hunting", name: "influ-hunting" },
  { path: "/influ-doctors", name: "influ-doctors" },
  { path: "/influ-gallery", name: "influ-gallery" },
  { path: "/influencers/contracts", name: "influ-contracts" },
  { path: "/influ-calendar", name: "influ-calendar" },
  { path: "/influ-cost", name: "influ-cost" },
  { path: "/influ-dashboard", name: "influ-dashboard" },
  { path: "/influencer-management/logs", name: "influ-logs" },
  { path: "/influencer-management/trash", name: "influ-trash" },
  { path: "/tasks", name: "tasks" },
  { path: "/my-tasks", name: "my-tasks" },
  { path: "/workload", name: "workload" },
  { path: "/files", name: "files" },
  { path: "/accounts", name: "accounts" },
];

let shotSeq = 0;

function shotPath(project: string, name: string): string {
  shotSeq += 1;
  return `e2e/screenshots/${project}/${String(shotSeq).padStart(2, "0")}-${name}.png`;
}

async function settle(page: Page, ms = 700) {
  await page.waitForTimeout(ms);
}

/** ห้ามมีเนื้อหาล้นจอแนวนอน (ยกเว้นกล่องที่ตั้งใจ scroll เอง ซึ่งไม่ดัน document) */
async function expectNoHorizontalOverflow(page: Page, where: string) {
  const ox = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(ox, `${where}: เนื้อหาล้นจอแนวนอน ${ox}px`).toBeLessThanOrEqual(2);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("form input").first().fill(EMAIL);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  const password = page.locator('input[type="password"]').first();
  await password.waitFor({ state: "visible", timeout: 15_000 });
  await password.fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  try {
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  } catch {
    // click แรกอาจยิงก่อน handler ผูกเสร็จ (จังหวะ hydration) — ส่งซ้ำอีกครั้ง
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
  }
}

/** เปิดของที่ลอยอยู่ (modal/เมนู/แผง) → ถ่ายรูป → ปิดด้วย Escape */
async function openShotClose(
  page: Page,
  project: string,
  open: () => Promise<boolean>,
  name: string
) {
  const opened = await open();
  if (!opened) return;
  await settle(page, 500);
  await page.screenshot({ path: shotPath(project, name) });
  await expectNoHorizontalOverflow(page, name);
  await page.keyboard.press("Escape");
  await settle(page, 300);
}

test("sweep ทุกหน้า + กด feature หลักครบ", async ({ page }, testInfo) => {
  test.skip(!EMAIL || !PASSWORD, "ตั้ง E2E_EMAIL / E2E_PASSWORD ก่อนรัน");
  const project = testInfo.project.name;
  const mobile = project === "mobile";
  shotSeq = 0;

  /* ---------- login ---------- */
  await page.goto("/login");
  await settle(page);
  await page.screenshot({ path: shotPath(project, "login"), fullPage: true });
  await expectNoHorizontalOverflow(page, "/login");
  await login(page);

  /* ---------- ทุกหน้า: เปิด + screenshot + เช็ค overflow ---------- */
  for (const p of PAGES) {
    await page.goto(p.path);
    await settle(page, 1200);
    await page.screenshot({
      path: shotPath(project, p.name),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page, p.path);
  }

  /* ---------- มือถือ: เมนู drawer + กระดิ่ง + ตั้งค่าโปรไฟล์ ---------- */
  if (mobile) {
    await page.goto("/dashboard");
    await settle(page, 800);

    // drawer เมนู
    await openShotClose(
      page,
      project,
      async () => {
        await page
          .getByRole("button", { name: "เปิดเมนู", exact: true })
          .click();
        return true;
      },
      "drawer"
    );

    // แผงกระดิ่งแจ้งเตือน
    await openShotClose(
      page,
      project,
      async () => {
        await page.locator('header button[title="การแจ้งเตือน"]').click();
        return true;
      },
      "bell-panel"
    );

    // ตั้งค่าโปรไฟล์ (เปิดจาก drawer)
    await openShotClose(
      page,
      project,
      async () => {
        await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
        await settle(page, 400);
        await page
          .locator('button[title="ตั้งค่าโปรไฟล์ (เปลี่ยนชื่อ/รูป)"]')
          .last()
          .click();
        return true;
      },
      "profile-settings"
    );
    await page.keyboard.press("Escape"); // เผื่อ drawer ยังเปิดอยู่ใต้ modal
    await settle(page, 300);
  }

  /* ---------- /tasks: 4 แท็บ + ตัวกรอง + แผงงาน ---------- */
  await page.goto("/tasks");
  await settle(page, 1500);

  // สลับตัวกรองผู้รับผิดชอบเป็น "ทั้งหมด" ให้เห็นการ์ดจริงของทีม (อ่านอย่างเดียว —
  // ตัวกรองเก็บใน localStorage ของ browser เทสต์เท่านั้น)
  const personFilter = page.locator(
    'button[aria-label="กรองตามผู้รับผิดชอบ"]'
  );
  if ((await personFilter.count()) > 0) {
    await personFilter.click();
    await settle(page, 400);
    const allOption = page.getByRole("option", {
      name: "ผู้รับผิดชอบ: ทั้งหมด",
    });
    if ((await allOption.count()) > 0) {
      await allOption.click();
      await settle(page, 600);
    } else {
      await page.keyboard.press("Escape");
    }
  }

  for (const tab of ["รอตรวจ", "งานเสร็จ", "ถังขยะ", "บันทึกงาน"]) {
    await page.getByRole("button", { name: tab }).first().click();
    await settle(page, 700);
    await page.screenshot({
      path: shotPath(project, `tasks-tab-${tab}`),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page, `/tasks แท็บ ${tab}`);
  }

  // ตัวกรองผู้รับผิดชอบ (PersonSelect portal)
  await openShotClose(
    page,
    project,
    async () => {
      const btn = page.locator('button[aria-label="กรองตามผู้รับผิดชอบ"]');
      if ((await btn.count()) === 0) return false;
      await btn.click();
      return true;
    },
    "tasks-filter-person"
  );

  // popover "ยกเว้น"
  await openShotClose(
    page,
    project,
    async () => {
      const btn = page.getByRole("button", { name: /ยกเว้น/ }).first();
      if ((await btn.count()) === 0) return false;
      await btn.click();
      return true;
    },
    "tasks-filter-exclude"
  );

  // เปิดแผงรายละเอียดงานจากการ์ดใบแรก (อ่านอย่างเดียว แล้วปิด)
  const firstCard = page.locator("[data-task-id]").first();
  if ((await firstCard.count()) > 0) {
    await firstCard.click();
    await settle(page, 900);
    const panel = page.locator('aside[aria-label="รายละเอียดงาน"]');
    await expect(panel).toBeVisible();
    await page.screenshot({ path: shotPath(project, "tasks-panel") });
    await expectNoHorizontalOverflow(page, "แผงรายละเอียดงาน");
    // จอเล็กปุ่ม X ถูกซ่อน (ใช้แถบ "กลับ" ด้านบนแทน) — เลือกตัวที่มองเห็นจริง
    await page
      .locator(
        'button[aria-label="ปิดแผงรายละเอียดงาน"], button[aria-label="ปิดแผงรายละเอียด"], button[aria-label="กลับไปที่รายการงาน"]'
      )
      .locator("visible=true")
      .first()
      .click();
    await settle(page, 400);
  }

  /* ---------- modal "เพิ่ม..." ของแต่ละหน้า (เปิดดูแล้วปิด ไม่บันทึก) ---------- */
  const ADD_BUTTONS: { path: string; label: string | RegExp; name: string }[] = [
    { path: "/pricing", label: "เพิ่มรายการ", name: "pricing-add-item" },
    { path: "/files", label: "เพิ่มลิงก์", name: "files-add-link" },
    { path: "/accounts", label: "เพิ่มบัญชี", name: "accounts-add-user" },
    { path: "/influencers", label: "สร้างนัดใหม่", name: "influ-new-case" },
    { path: "/influ-hunting", label: "เพิ่มโปรไฟล์", name: "influ-add-profile" },
    { path: "/influ-hunting", label: "เพิ่มรายชื่อ", name: "hunting-add" },
    { path: "/my-tasks", label: "จัดการแท็ก", name: "my-tasks-tag-manager" },
  ];
  for (const a of ADD_BUTTONS) {
    await page.goto(a.path);
    await settle(page, 1000);
    await openShotClose(
      page,
      project,
      async () => {
        const btn = page.getByRole("button", { name: a.label }).first();
        if ((await btn.count()) === 0) return false;
        await btn.click();
        return true;
      },
      a.name
    );
  }

  /* ---------- หน้าเดินงาน influencer รายคน (คนแรกบนบอร์ด) ---------- */
  await page.goto("/influencers");
  await settle(page, 1000);
  const influCard = page
    .locator('[aria-label^="เปิดหน้าเดินงานของ"]')
    .first();
  if ((await influCard.count()) > 0) {
    await influCard.click();
    await page.waitForURL("**/influencers/**", { timeout: 15_000 });
    await settle(page, 1200);
    await page.screenshot({
      path: shotPath(project, "influ-detail"),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page, "หน้าเดินงาน influencer");
  }
});
