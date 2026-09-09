import { expect, test, type Page } from "@playwright/test";

/**
 * Sales Queue หลังรวมเข้าแอปหลัก (2026-09-09) — เปิดทุกหน้าของระบบคิวใต้ shell แอปหลัก
 * ถ่ายรูป + เช็ค console error/overflow + เมนู "คิว" ใน sidebar + การ์ดหน้าประตูชี้ /queue
 * รันด้วย: npx playwright test e2e/queue-shots.spec.ts   (ต้องตั้ง E2E_EMAIL / E2E_PASSWORD — บัญชี admin)
 * ⚠️ อ่านอย่างเดียว — ไม่กดปุ่มที่เขียนข้อมูล (dev ชี้ DB โปรดักชัน)
 */
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

/** หัวข้อ h1 ของแต่ละหน้า — จับด้วย role heading เท่านั้น: getByText แบบหลวมไปชนป้ายเมนู
    ของ shell แอปหลัก (แถบล่างมือถือ "คิว"+"ของฉัน" ต่อกันเป็น "คิวของฉัน", rail "ทีม")
    ซึ่งถูกซ่อนบนอีก viewport แล้วรอ visible ไม่มีวันจบ */
const PAGES: { path: string; name: string; heading: RegExp | string }[] = [
  { path: "/queue", name: "queue", heading: /^(คิววันนี้|คิวของฉัน)$/ },
  { path: "/queue/new", name: "queue-new", heading: "วางข้อมูลลูกค้า" },
  { path: "/queue/team", name: "queue-team", heading: "ทีม" },
  { path: "/queue/ranking", name: "queue-ranking", heading: /^อันดับ Drag/ },
  { path: "/queue/audit", name: "queue-audit", heading: /^ประวัติการทำรายการ/ },
];

test.use({ actionTimeout: 20_000 });

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
  const email = page.locator("#email");
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ state: "visible", timeout: 120_000 });
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

/** ไม่มีอะไรล้นจอแนวนอน (กติกา 375px ของระบบ) */
async function assertNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label}: horizontal overflow ${overflow}px`).toBeLessThanOrEqual(1);
}

test("Sales Queue ใต้แอปหลัก — ทุกหน้าเปิดได้ ไม่มี error", async ({ page }, info) => {
  test.skip(!EMAIL || !PASSWORD, "ตั้ง E2E_EMAIL / E2E_PASSWORD ก่อนรัน");
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  /* หน้าประตู: การ์ด Sales Operation ต้องเป็นลิงก์ภายใน /queue */
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  const card = page.getByRole("link", { name: /Sales Operation/ }).first();
  await card.waitFor({ state: "visible", timeout: 120_000 });
  await expect(card).toHaveAttribute("href", "/queue");

  await login(page);

  for (const p of PAGES) {
    await page.goto(p.path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page
      .getByRole("heading", { level: 1, name: p.heading, exact: typeof p.heading === "string" })
      .first()
      .waitFor({ state: "visible", timeout: 120_000 });
    // แท็บของระบบคิวต้องอยู่ใต้ shell แอปหลัก (มีเมนู "คิว" ของ sidebar/แถบล่าง + แท็บภายใน)
    await expect(page.getByRole("navigation", { name: "เมนูระบบคิว" })).toBeVisible();
    await page.waitForTimeout(800);
    await assertNoOverflow(page, p.path);
    await page.screenshot({
      caret: "initial",
      path: `e2e/screenshots/queue-${info.project.name}-${p.name}.png`,
      fullPage: true,
    });
  }

  console.log("console errors:", errors.slice(0, 5));
  expect(errors.filter((e) => !/favicon|manifest|WebSocket/i.test(e))).toEqual([]);
});
