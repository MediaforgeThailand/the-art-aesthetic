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
  { path: "/wellness", name: "wellness" },
  { path: "/wellness-calendar", name: "wellness-calendar" },
  { path: "/tasks", name: "tasks" },
  { path: "/my-tasks", name: "my-tasks" },
  { path: "/workload", name: "workload" },
  // KPI คอนเทนต์ — ปฏิทินรายคน / ภาพรวมทีม / หน้าตั้งค่าเป้า
  { path: "/content-tracking", name: "content-tracking" },
  { path: "/content-tracking/overview", name: "content-overview" },
  { path: "/content-kpi", name: "content-kpi" },
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

/** เปิดหน้าโดยรอแค่ DOMContentLoaded — บทเรียน 2026-08-28: dev server (Turbopack) ปล่อยให้
    request ค้างได้เป็นนาที (เช่น RSC prefetch ของ /dashboard) ทำให้ browser ไม่ยิง load event
    ทั้งที่หน้า render ครบแล้ว — sweep เคยค้างที่ goto /pricing "waiting until load" จนกินเวลา
    เทสหมด 10 นาทีทั้งสอง viewport. เนื้อหาถูกตรวจต่อด้วย settle + expectNot404 + assert
    รายหน้าอยู่แล้ว จึงไม่ต้องรอ load; timeout 60s เพื่อให้หน้าที่พังจริงล้มดังๆ เร็วๆ */
async function gotoPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
}

/** หน้า 404 ของ Next ต้องไม่โผล่หลัง navigate — บทเรียน 2026-08-28: sweep เคยถ่าย 404
    ของทุก path ซ้อนชั้นแล้ว "ผ่าน" ทั้งชุด (server เทสต์ที่ reuse มาเป็นของ checkout อื่น/
    สถานะเพี้ยน) เพราะลูป PAGES ไม่เคย assert เนื้อหา — ต่อไปนี้ 404 ต้องล้มดังๆ ทันที */
async function expectNot404(page: Page, where: string) {
  await expect(
    page.getByText("This page could not be found"),
    `${where}: หน้าเป็น 404 — เช็คว่า server เทสต์เป็นของ checkout นี้จริง (ดูคอมเมนต์ reuseExistingServer ใน playwright.config.ts)`
  ).toHaveCount(0);
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
  await gotoPage(page, "/login");
  await page.locator("form input").first().fill(EMAIL);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  const password = page.locator('input[type="password"]').first();
  await password.waitFor({ state: "visible", timeout: 15_000 });
  await password.fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  // waitUntil "commit" — แค่ URL เปลี่ยนถึง /start ก็พอ ไม่รอ load (กติกาเดียวกับ gotoPage)
  // /start ไม่ใช่ /dashboard: login-client push ไป /start (เลือกหน้าแรกตามสิทธิ์) ตั้งแต่
  // ตอนย้าย logic ออกจาก root — เทสต์ที่ยังรอ **/dashboard จะ timeout แม้ล็อกอินสำเร็จ
  try {
    await page.waitForURL("**/start", { timeout: 15_000, waitUntil: "commit" });
  } catch {
    // click แรกอาจยิงก่อน handler ผูกเสร็จ (จังหวะ hydration) — ส่งซ้ำอีกครั้ง
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL("**/start", { timeout: 30_000, waitUntil: "commit" });
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
  await gotoPage(page, "/login");
  await settle(page);
  await page.screenshot({ path: shotPath(project, "login"), fullPage: true });
  await expectNoHorizontalOverflow(page, "/login");
  await login(page);

  /* ---------- ทุกหน้า: เปิด + screenshot + เช็ค overflow ---------- */
  for (const p of PAGES) {
    await gotoPage(page, p.path);
    await settle(page, 1200);
    await expectNot404(page, p.path);
    await page.screenshot({
      path: shotPath(project, p.name),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page, p.path);
  }

  /* ---------- ปฏิทินคิว: มุมมองสัปดาห์ + ตัวกรอง (จอใหญ่ = แถว inline, มือถือ = bottom sheet) ---------- */
  await gotoPage(page, "/influ-calendar");
  await settle(page, 1000);

  // เดสก์ท็อป (≥lg): หน้าปฏิทินต้องสูงพอดีจอ ไม่มี scroll แนวตั้ง (คำสั่งผู้ใช้ 2026-08-20)
  const expectNoVerticalScroll = async (where: string) => {
    if (mobile) return;
    const oy = await page.evaluate(() => {
      const el = document.querySelector("main > div");
      return el ? el.scrollHeight - el.clientHeight : 0;
    });
    expect(oy, `${where}: หน้าปฏิทินเลื่อนแนวตั้งได้ ${oy}px`).toBeLessThanOrEqual(2);
  };
  await expectNoVerticalScroll("/influ-calendar มุมมองเดือน");

  await page.getByRole("button", { name: "สัปดาห์", exact: true }).click();
  await settle(page, 500);
  await page.screenshot({
    path: shotPath(project, "influ-calendar-week"),
    fullPage: true,
  });
  await expectNoHorizontalOverflow(page, "/influ-calendar มุมมองสัปดาห์");
  await expectNoVerticalScroll("/influ-calendar มุมมองสัปดาห์");
  await page.getByRole("button", { name: "ตัวกรองปฏิทิน", exact: true }).click();
  await settle(page, 400);
  await page.screenshot({
    path: shotPath(project, "influ-calendar-filters"),
    fullPage: true,
  });
  await expectNoHorizontalOverflow(page, "/influ-calendar ตัวกรอง");
  await page.keyboard.press("Escape"); // ปิดตัวกรอง (มือถือเป็น bottom sheet)
  await settle(page, 300);

  /* ---------- มือถือ: เมนู drawer + กระดิ่ง + ตั้งค่าโปรไฟล์ ---------- */
  if (mobile) {
    await gotoPage(page, "/dashboard");
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
  await gotoPage(page, "/tasks");
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
    { path: "/wellness", label: "เพิ่มการ์ดลูกค้า", name: "wellness-add-customer" },
  ];
  for (const a of ADD_BUTTONS) {
    await gotoPage(page, a.path);
    await settle(page, 1000);
    await expectNot404(page, a.path);
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
  await gotoPage(page, "/influencers");
  await settle(page, 1000);
  await expectNot404(page, "/influencers (ก่อนเปิดหน้าเดินงาน)");
  const influCard = page
    .locator('[aria-label^="เปิดหน้าเดินงานของ"]')
    .first();
  if ((await influCard.count()) > 0) {
    await influCard.click();
    try {
      await page.waitForURL("**/influencers/**", { timeout: 15_000 });
    } catch {
      // click แรกอาจยิงก่อน hydration ผูก handler เสร็จ (แพตเทิร์นเดียวกับ login)
      await influCard.click();
      await page.waitForURL("**/influencers/**", { timeout: 30_000 });
    }
    await settle(page, 1200);
    await expectNot404(page, "หน้าเดินงาน influencer");
    await page.screenshot({
      path: shotPath(project, "influ-detail"),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page, "หน้าเดินงาน influencer");
  }

  /* ---------- Wellness: การ์ดลูกค้าใบแรก (บอร์ด → หน้ารายละเอียด) ---------- */
  await gotoPage(page, "/wellness");
  await settle(page, 1000);
  await expectNot404(page, "/wellness (ก่อนเปิดการ์ดลูกค้า)");
  // แถวลูกค้าเป็น <Link href="/wellness/{id}"> — เมนู shell ลิงก์ "/wellness" เฉยๆ ไม่ติด selector นี้
  const wellnessRow = page.locator('a[href^="/wellness/"]').first();
  if ((await wellnessRow.count()) > 0) {
    await wellnessRow.click();
    try {
      await page.waitForURL("**/wellness/**", { timeout: 15_000 });
    } catch {
      // click แรกอาจยิงก่อน hydration ผูก handler เสร็จ (แพตเทิร์นเดียวกับ influ detail)
      await wellnessRow.click();
      await page.waitForURL("**/wellness/**", { timeout: 30_000 });
    }
    await settle(page, 1200);
    await expectNot404(page, "หน้าการ์ดลูกค้า wellness");
    await page.screenshot({
      path: shotPath(project, "wellness-detail"),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page, "หน้าการ์ดลูกค้า wellness");
  }

  /* ---------- Wellness: ปฏิทินคิวแพทย์ — เปิดแผงคิวของวัน (เลือกวันที่มีคิวถ้ามี) ---------- */
  await gotoPage(page, "/wellness-calendar");
  await settle(page, 1000);
  const wellnessDays = page.locator('button[aria-label^="เปิดคิววันที่"]');
  // ปฏิทินเดือนมีช่องวันเสมอ (≥28) — assert แข็งๆ กันหน้า crash แล้ว sweep ผ่านเงียบๆ
  // (บทเรียน 2026-08-28: server error จาก client-reference proxy ทำให้ section นี้ถูกข้ามทั้งก้อน)
  await expect(
    wellnessDays.first(),
    "ปฏิทินคิวแพทย์ Wellness ต้องมีช่องวันให้กด — ไม่มีแปลว่าหน้าพัง"
  ).toBeVisible({ timeout: 15_000 });
  {
    // วันแรกที่มีชิปคิว (span.truncate อยู่ใน DOM ทั้งจอใหญ่/จอเล็ก) — ไม่มีก็ใช้วันแรกของเดือน
    const busyDay = wellnessDays
      .filter({ has: page.locator("span.truncate") })
      .first();
    const target = (await busyDay.count()) > 0 ? busyDay : wellnessDays.first();
    await openShotClose(
      page,
      project,
      async () => {
        await target.click();
        return true;
      },
      "wellness-day-panel"
    );
  }
});
