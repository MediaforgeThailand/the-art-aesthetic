import { defineConfig } from "@playwright/test";

/**
 * ชุดเทสต์ e2e UI — รันด้วย `npm run test:e2e`
 * ต้องตั้ง env ก่อนรัน: E2E_EMAIL / E2E_PASSWORD (บัญชีทดสอบที่มีสิทธิ์ครบ + admin)
 * server เทสต์เปิดเองที่พอร์ต 3100 (ไม่ชนกับ dev ปกติที่ 3000)
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  // sweep ทั้งระบบเป็นเทสต์ยาวไฟล์เดียว — dev server compile ทีละหน้า ให้เวลาเหลือๆ
  timeout: 600_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [
    {
      name: "mobile",
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1366, height: 850 } },
    },
  ],
  webServer: {
    // --use-system-ca จำเป็นบนเครื่องที่มี TLS interception (ดู AGENTS.md)
    command: `node --use-system-ca node_modules/next/dist/bin/next dev -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
