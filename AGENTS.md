<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Aesthetic System — คู่มือสำหรับ agent

ระบบหลังบ้านแผนก Aesthetic (โรงพยาบาลศัลยกรรม The ART): งาน / รายงาน / Product Pricing (โปรโมชันที่อนุมัติ — ตาราง `price_promotions` โทนชมพู) / Influ Management / คลังลิงก์ไฟล์+อัปโหลด / แดชบอร์ดยอดขาย (ข้อมูลจากไฟล์ทีม DA)
**Influ Management** (`/influencers`): pipeline 6 stage (ติดต่อ+followup → รายละเอียดเคส → Memo ขออนุมัติ → เซนสัญญา 2 ฉบับ → วันรับบริการ(แก้หัตถการ+ลายเซนหัวหน้ากำกับใน procedure_history jsonb) → follow-up 10 step จาก FOLLOWUP_TEMPLATE ใน influ-constants.ts) — ตาราง influencers/influ_followups/influ_signatures/influ_tasks/influ_campaigns, ลายเซนดิจิทัลวาดผ่าน `src/components/signature-pad.tsx` เก็บเป็น PNG data URL, Tier auto จากยอดผู้ติดตาม, preset ผู้เซน memo ใน `src/lib/influ-constants.ts`, หน้า `/influencers/contracts` = อายุสัญญา 6 เดือน + Sub Campaign (เพิ่มได้เฉพาะสัญญายังไม่หมด), รูป influ อัพเข้า bucket documents path `influencers/{id}/`
UI เป็นภาษาไทยทั้งหมด — desktop-first เท่านั้น ไม่ต้องเผื่อมือถือ
**หน้าที่ถูกถอดออกแล้ว (อย่าสร้างกลับ/อย่าลิงก์ไป):** /documents (ย้ายความสามารถอัปโหลดไปรวมใน /files แล้ว) และ /import — โค้ดเก่าอยู่ที่ `archive/removed-pages-20260704/` (excluded จาก tsconfig)

## Stack & เวอร์ชัน

- Next.js 16.2 (App Router, `src/` dir, Turbopack) + React 19 + TypeScript strict
- Tailwind CSS v4 (theme ใน `src/app/globals.css`, ไม่มี tailwind.config)
- Supabase: Postgres + Auth (email/password) + Storage (bucket `documents`)
- Recharts (กราฟ), SheetJS `xlsx` + PapaParse (อ่านไฟล์ DA), lucide-react (ไอคอน)

## กติกาสำคัญ

- **Next 16**: ใช้ `src/proxy.ts` (default export) แทน middleware.ts; `cookies()` เป็น async
- Server page ดึงข้อมูลด้วย `createClient()` จาก `@/lib/supabase/server` (ต้อง `await`)
  แล้วส่ง props ให้ client component; mutation ฝั่ง client ใช้ `@/lib/supabase/client` + `router.refresh()`
- Schema จริงอยู่ที่ `supabase/migrations/` (0001..000N — mirror ของ migration ที่ apply บน Supabase แล้ว ห้ามรันซ้ำ; migration ใหม่ apply ผ่าน Supabase MCP แล้วเขียนไฟล์ mirror เพิ่ม) — types ต้องตรงกับ `src/lib/database.types.ts`
- UI primitives ใช้จาก `src/components/ui.tsx` เท่านั้น (Button, Card, Modal, ...) ห้ามสร้างซ้ำ
- Label/สีของสถานะ-หมวดหมู่มาจาก `src/lib/constants.ts`; format เงิน/วันที่จาก `src/lib/format.ts`
- ดีไซน์ (CI "The ART — Plastic Surgery Hospital"): โทน rose gold/copper — custom Tailwind tokens `brand-50..900` + `cream`/`cream-soft` (นิยามใน globals.css), **พื้นหลัง body เป็น gradient rose gold (fixed) + กล่องเป็น glassmorphism**: utility `glass` (การ์ด/modal/แผงข้าง) และ `glass-soft` (คอลัมน์บอร์ด/พื้นรอง) นิยามใน globals.css — ห้าม hardcode bg ทึบใหม่ ให้ใช้สอง utility นี้, ปุ่ม primary gradient brand-500→600, ฟอนต์ display คือ Playfair Display (`font-display` ใช้กับข้อความละติน เช่น โลโก้), desktop-first, มี animation: `animate-fade-in`, `animate-fade-in-up`, `animate-scale-in`, `animate-slide-in-right` + `active:scale-[0.97]` ตอนกด — สีแดง rose ใช้เฉพาะ error/danger/เลยกำหนด, โลโก้ (THE ART + tagline "Plastic Surgery Hospital") อยู่ที่ src/components/logo.tsx
- tasks join profiles ต้องใส่ FK hint: `profiles!tasks_assignee_id_fkey` (มี FK สองตัว)
- **Perf (สำคัญ):** อ่านตัวตนผู้ใช้ด้วย `supabase.auth.getClaims()` (ตรวจ JWT ในเครื่อง) — ห้ามกลับไปใช้ getUser() ใน proxy/layout/pages เว้นแต่จำเป็นจริง; query หลายก้อนในหน้าเดียวให้ยิงขนาน `Promise.all`; Vercel function ต้องอยู่ region `sin1` (vercel.json — DB อยู่ Sydney)
- **Layout:** `(app)/layout.tsx` ไม่ครอบ container ให้แล้ว (main เป็น overflow-hidden) — หน้าปกติต้องครอบเนื้อหาด้วย `<PageContainer>` จาก ui.tsx เอง (คุม scroll แนวตั้ง, **full-width ไม่จำกัด max-w** — ผู้ใช้ต้องการใช้พื้นที่จอเต็ม); หน้า /tasks เป็น full-bleed จัดเลย์เอาต์เองทั้งหน้า
- หน้า /tasks เป็น**ลิสต์แบบ Monday/Asana จัดกลุ่มตามเซคชัน** (เปลี่ยนจากบอร์ดการ์ดเมื่อ 2026-07-05 — board.tsx ยังอยู่ในโค้ดแต่ไม่ได้ใช้แล้ว, ไม่มี drag-reorder) — **วัตถุประสงค์: ทีมงานบันทึกงานที่ตัวเองทำ + เก็บไฟล์/ลิงก์ Google Drive ของงานที่ได้รับอนุมัติ** (Manager อนุมัติผ่าน LINE นอกระบบ ผู้ใช้กลับมาติ๊กเสร็จเอง) — tasks-client.tsx (state + optimistic mutations) / list.tsx (ลิสต์+เซคชัน+quick add) / task-card.tsx (AssigneePicker, CompleteToggle — ใช้ร่วม) / task-panel.tsx (แผงรายละเอียด: field ไร้กล่อง + ช่องไฟล์งานที่ Approve แล้ว `tasks.deliverable_url`/`deliverable_file_path` (อัพเข้า storage `tasks/{id}/`) + งานย่อย `task_subtasks` + ความคิดเห็น `task_comments` โหลด client-side) — คอมเมนต์แนบไฟล์ (`file_path`)/ลิงก์ (`link_url`) ได้ และติ๊ก `is_revision` = ส่งงานแก้ไข รันเลข `revision_number` อัตโนมัติต่อ task — ใช้ `task_sections` + `tasks.completed`/`position` (คอลัมน์ `status` เป็น legacy ห้ามใช้ต่อ); หน้า /workload คำนวณสถิติ client-side + นับ "แก้ไข (เดือนนี้)" ต่อคนจาก revision comments (ผูกกับ assignee ของ task) เพื่อวัด KPI
- ส่วนที่แสดงข้อมูล demo ต้องติด DemoBadge/DemoBanner (src/components/demo-badge.tsx) — ตรวจจาก sales_records.note='demo' หรือ tasks.description='demo' (admin_records/sales_targets/staff_kpis ก็ใช้ note='demo')
- **รายงาน/แดชบอร์ดผู้บริหาร:** `/dashboard` เป็น landing รายงานรวมหน้าเดียว (5 section คนละโทนสี + ตัวกรองช่วงเวลา sticky ใช้ร่วมทั้งหน้า, default `mtd` = 1 เดือนนี้–วันนี้ เวลาไทย; PeriodKey มี today/7d/30d/mtd/90d/6m/12m ใน report-utils); component ภาพกลางอยู่ที่ `src/components/report-viz.tsx` (HeroCard, DeltaChip, PersonKpiBar แบบ bullet เทียบเป้า, TargetProgress, MiniStat) + helper ใน report-utils (`sumTargetsForPeriod` prorate เดือนปัจจุบัน, `achievementTone` เขียว≥100/เหลือง80–99/แดง<80, `TEAM_COLORS` ทีมขาย=brand ทีมแอดมิน=sky) — เป้า KPI รายคนอยู่ตาราง `staff_kpis` (month, person_name, team 'sales'|'admin', target_amount)

## เครื่องของผู้ใช้ (Windows)

- Node ไม่อยู่ใน PATH ของ shell เดิม — ใช้:
  PowerShell: `$env:Path = "C:\Users\User\nodejs\node-v24.18.0-win-x64;" + $env:Path`
  Git Bash: `export PATH="/c/Users/User/nodejs/node-v24.18.0-win-x64:$PATH"`
- **เครื่องนี้มี TLS interception** (antivirus/proxy) — Node fetch ฝั่ง server จะเจอ `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ถ้าไม่เปิด `--use-system-ca` (ตั้ง `NODE_OPTIONS=--use-system-ca` ใน user env แล้ว และ `.claude/launch.json` ส่ง flag นี้ให้ dev server แล้ว) — ห้ามแก้ด้วย NODE_TLS_REJECT_UNAUTHORIZED=0
- Build: `npm run build` / Dev: `npm run dev`

## Backend / Deployment (พร้อมใช้งานแล้ว)

- Supabase: โปรเจกต์ `TheArtAesthetic` (`zcoqzasbtgfccuibteji`, org oxrqcyrbjfhseaitvkdo, ap-southeast-2) — schema + RLS + storage bucket `documents` + seed demo แล้ว (ลบ demo: `delete from sales_records where note='demo'; delete from tasks where description='demo';`)
- Vercel: โปรเจกต์ `the-art-aesthetic` (team mediaforge2026-9756s-projects) — production alias **https://the-art-aesthetic.vercel.app** — env vars ตั้งใน Vercel แล้ว (production+preview), deploy ด้วย `npx vercel deploy --prod --yes`
- RLS เป็นแบบ "authenticated เข้าถึงได้ทั้งหมด" โดยตั้งใจ (ระบบภายในแผนก) — advisor จะเตือน rls_policy_always_true เป็นเรื่องปกติ
