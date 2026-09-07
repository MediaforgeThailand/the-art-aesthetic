# สถาปัตยกรรมระบบ

> อัปเดต 2026-09-08 — เอกสารนี้อธิบาย "ของที่มีอยู่จริง" ในโค้ด สำหรับคนที่เพิ่งเข้ามาอ่าน repo (ทีม IT / นักพัฒนาใหม่) ประวัติการตัดสินใจรายฟีเจอร์อยู่ใน `AGENTS.md`

## 1. ภาพรวม

```
ผู้ใช้ (มือถือ/เดสก์ท็อป, PWA)
   │  HTTPS
   ▼
Next.js 16 (App Router)  ── proxy.ts ตรวจ session ทุก request ──┐
   │                                                            │
   ├─ (app)      ระบบ Team                                       │
   ├─ (influ)    ระบบ Influencer  ◄── src/influ/ (lib/components/public)
   ├─ (wellness) ระบบ Wellness                                   │
   └─ หน้าสาธารณะ: / (ประตู), /price-list                         │
                                                                │
   ▼ supabase-js (anon key + cookie session)                     ▼
Supabase ─ Postgres 17 (RLS) ─ Auth ─ Storage `documents` ─ Realtime ─ Edge Functions ─ pg_cron/pg_net/Vault
                                                                │
   แอปอื่นที่ใช้ DB เดียวกัน: Sales Assistant (iPad, repo แยก, ตาราง sa_*)
```

- **1 repo = 1 Next app** ที่มี 3 route group — route group ไม่โผล่ใน URL (`/influencers` ไม่ใช่ `/(influ)/influencers`) แต่แต่ละกลุ่มมี `layout.tsx` ของตัวเอง = โครงหน้า/เมนู/การตรวจสิทธิ์แยกกัน
- **ไม่มี backend ของตัวเอง** — ทุกอย่างคุยกับ Supabase ตรงจากทั้ง server component และ client component; ตรรกะที่ต้องเชื่อถือได้อยู่ใน DB (trigger / RPC `security definer` / RLS) และใน edge function
- **ภาษา UI ไทยทั้งหมด, responsive ทั้งระบบ** (ทีมใช้จากมือถือเป็นหลัก) — กติกา UI อยู่ใน `AGENTS.md` หัวข้อ responsive

## 2. flow ของ request

1. `src/proxy.ts` (Next 16 ใช้แทน middleware) — ตรวจ JWT ด้วย `supabase.auth.getClaims()` (ตรวจในเครื่อง ไม่ยิง network) + refresh token; ไม่มี session → `/login`; path สาธารณะ (`/`, `/price-list`, `/api/warm`, `/manifest.webmanifest`, `/sw.js`, `/auth/callback`) ปล่อยผ่าน
2. `layout.tsx` ของ route group — อ่านผู้ใช้ + `getAccess()` (สิทธิ์จาก `profiles`) แล้ว render โครงหน้า (`sidebar.tsx` / `influ-shell.tsx` / `wellness-shell.tsx`)
3. `page.tsx` (server component) — ยิง query หลายก้อนขนานด้วย `Promise.all([getAccess(), ...])` แล้วเช็ค `hasPermission()`; ไม่มีสิทธิ์ = `<AccessNotice/>`; มี = ส่ง props ให้ `*-client.tsx`
4. client component — state + mutation ผ่าน `@/lib/supabase/client` แล้ว `router.refresh()` (มี client cache 30 วิ ใน `next.config.ts`); บางหน้าใช้ Realtime (บอร์ด Task, กระดิ่งแจ้งเตือน)

## 3. โมดูล

| โฟลเดอร์ | เนื้อหา | หมายเหตุ |
|---|---|---|
| `src/app/(app)/` | Team: `tasks` (บอร์ด Trello + ตรวจงาน 2 ลำดับ + brief + คิวโพส), `content-tracking`/`content-kpi` (KPI คอนเทนต์), `workload`, `all-media`, `files`, `my-tasks`, `dashboard` (ยอดขาย), `pricing`, `tag-management`, `accounts` | โครงหน้า `src/components/sidebar.tsx` |
| `src/app/(influ)/` | Influencer: `influ-hunting` (ล่ารายชื่อ), `influencers` (บอร์ดเคส + หน้าเคส `[id]` + Follow Up `contracts`), `influ-calendar`, `influ-cost`, `influ-campaigns`, `influ-doctors`, `influ-gallery`, `influ-dashboard`, `influencer-management/{logs,trash,profiles}` | โครงหน้า `src/influ/components/influ-shell.tsx` |
| `src/influ/` | ของกลางของระบบ Influencer: `lib/influ-constants.ts` (stage, tier, เพดานงบ, voucher, แฮชแท็ก, checklist), `lib/influ-log.ts` (activity log), `lib/influ-notify.ts` (แจ้งเตือนตามผู้รับผิดชอบ), `components/` (shell, กระดิ่ง, แผงตัวกรอง, ลายเซน), `public/` (สิ่งที่ Team ใช้ได้) | ดู `src/influ/README.md` |
| `src/app/(wellness)/` | Wellness 1 บทบาท = 1 หน้า (`register`/`lab`/`contact`/`calendar`/`clinic`/`cases`/`[id]`) | ค่าคงที่ `src/lib/wellness-constants.ts`, component `src/components/wellness/` |
| `src/components/` | `ui.tsx` (primitives ทั้งหมด: Button/Card/Modal/Input/…), `access-notice`, `logo`, `profile-settings`, `notification-bell` (Team), `anchored-menu.ts` (เมนูลอยที่ปลอดภัยบนมือถือ), `media-grid`, `report-viz` | |
| `src/lib/` | `supabase/{client,server}.ts`, `env.ts`, `access.ts` (server) + `permissions.ts` (client-safe), `database.types.ts` + `types.ts`, `constants.ts`, `format.ts` (เงิน/วันที่ไทย — `todayISO()` คือ "วันนี้เวลาไทย" ตัวเดียว), `upload.ts` + `upload-prepare.ts` + `video-compress.ts`, `push.ts` (Web Push), `use-*.ts` hooks | |

### กฎขอบเขต (บังคับใน `eslint.config.mjs`)

- นอกระบบ Influencer → import จาก Influ ได้เฉพาะ `@/influ/public/*`
- ระบบ Influencer → ห้าม import โค้ดของ Team/Wellness; ของที่ใช้ร่วมกันต้องอยู่ `src/lib` / `src/components`

สิ่งที่ Team ยังพึ่ง Influ (ทั้งหมด): ตัวเลือกแท็ก influencer/หมอในงานคอนเทนต์ (`/tasks`), แฮชแท็กบังคับของเคส, และตัวจัดการทะเบียนหมอที่ฝังใน `/tag-management`

## 4. ข้อมูล: ตารางไหนเป็นของใคร

| กลุ่ม | ตาราง | เจ้าของ |
|---|---|---|
| ตัวตน/สิทธิ์ | `profiles`, `allowed_emails`, `allowed_email_domains`, `app_settings` | กลาง (จัดการที่ `/accounts`) |
| Influencer | `influencers` (1 แถว = เคส 1 รอบ), `influ_profiles` (ตัวบุคคล) + `influ_profile_channels/photos`, `influ_prospects` + `influ_prospect_contacts` (ล่ารายชื่อ), `influ_procedure_items` (หัตถการ/ต้นทุน), `influ_calendar_events` (คิว), `influ_assignees` (ผู้รับผิดชอบรายขั้น), `influ_post_links`, `influ_tasks` (checklist), `influ_campaign_defs/members`, `influ_services`, `influ_case_photos`, `influ_links`, `influ_activity_log`, `influ_notifications`, `influ_deleted_backups` (ถังขยะ 30 วัน), `doctors` (ทะเบียนแพทย์ + เลขใบ ปว.) | ระบบ Influencer |
| Team | `tasks` + `task_sections/comments/files/subtasks/subtask_files/categories/reviewers`, `content_categories`, `content_kpis`, `notifications`, `push_subscriptions`, `list_*` (My List ส่วนตัว), `analysis_links`, `file_links`, `documents` | ระบบ Team |
| ยอดขาย | `sales_records` (sync จาก Google Sheets ของทีม DA รายวัน), `sheet_sync_runs`, `sales_targets`, `staff_kpis`, `admin_records`, `data_imports` | Team (`/dashboard`) |
| ราคา | `price_items` (ราคาอ้างอิงกลาง — Influ/Sales Assistant อ้าง), `promo_packages` + `promo_package_items` (โปรที่ขึ้น `/price-list`), `price_promotions` (ไม่ได้ใช้ 0 แถว) | Team (`/pricing`) |
| Wellness | `wellness_customers`, `wellness_lab_files`, `wellness_appointments` | ระบบ Wellness |
| แอปอื่น | `sa_*` (+ trigger `promo_mirror_*` ที่คัดลอกโปรจาก `promo_packages` ไปให้) | Sales Assistant (repo แยก) — ห้ามแตะ |
| แอปอื่น | `sq_*` (+ RPC `sq_*`) | Sales Queue `queue.theartbb.com` (repo แยก ใช้ Supabase เดียวกัน) — ห้ามแตะ |

**จุดที่ข้ามระบบกันใน DB (ทั้งหมดมีแค่นี้):**
- `tasks.influencer_id` → `influencers` และ `tasks.doctor_id` → `doctors` (งานคอนเทนต์ติดแท็กว่าเป็นของ influ/หมอคนไหน — SET NULL)
- Influ อ่าน `price_items` / `promo_packages` (เมนูหัตถการ + รหัสโปรสำหรับแฮชแท็ก) และอ่าน `tasks` ที่ผูก influ (โชว์งานคอนเทนต์ในหน้าเคส)
- ทุกระบบอ่าน `profiles` (ชื่อ/รูป/สิทธิ์)

ตารางที่ยังอยู่แต่ไม่มี UI แล้ว (เก็บข้อมูลเก่า): `influ_followups`, `influ_campaigns` (Sub Campaign เดิม), `influ_signatures` (โหมดเซนดิจิทัลที่ถอดออก), `price_promotions`, `documents`, `data_imports`

## 5. สิทธิ์และตัวตน

- Supabase Auth — บัญชีสร้างโดยผู้ดูแล (edge function `admin-users` ใช้ service role) หรืออีเมลโดเมนบริษัทผ่าน Google; trigger `handle_new_user` ปฏิเสธคนที่ไม่อยู่ใน allowlist
- สิทธิ์ = `profiles.permissions text[]` + `profiles.role` — เช็คที่ชั้นแอป (`getAccess()`/`hasPermission()`/`canXxx()`) **RLS ส่วนใหญ่เปิดให้ authenticated ทั้งหมด** จึงต้องถือว่าทุกบัญชีที่ล็อกอินได้อ่านข้อมูลทั้งฐานได้ผ่าน REST (เหตุผลที่ปิดการสมัครเองและเปิดเฉพาะ Google สำหรับโดเมนบริษัท)
- ของที่ DB กันจริง: RPC ของ Influ (ลบ/กู้คืน/ล้างถังขยะ/รวมโปรไฟล์/สร้างเคส) มี guard ระดับสิทธิ์ใน `security definer`, ตารางส่วนตัว (`list_*`, `push_subscriptions`, `influ_notifications`) มี RLS ต่อเจ้าของ

## 6. แจ้งเตือน

| ระบบ | ตาราง | ส่งจาก | Push |
|---|---|---|---|
| Team | `notifications` (+ `seen_at`/`read_at`) | client ตอนเกิดเหตุการณ์ (`notify()` ใน tasks-client) | trigger `notifications_push_after_insert` → edge `send-push` (เฉพาะ `priority='primary'`) |
| Influencer | `influ_notifications` (`level` action/update) | `buildInfluNotifications()` คิดผู้รับจาก `influ_assignees.scopes` — ตัดผู้ทำเองออก | trigger → edge `send-push` เดียวกัน (`body.source='influ'`, เฉพาะ `level='action'`) |

Web Push: service worker `public/sw.js` (มีไว้เพื่อ push เท่านั้น ไม่มี cache), ทะเบียนอุปกรณ์ `push_subscriptions`, คีย์ VAPID สาธารณะใน `app_settings.vapid_public_key` / คีย์ลับใน Vault

## 7. งานตามเวลา (pg_cron)

| job | ทำอะไร |
|---|---|
| `vercel-warm-ping` ทุก 5 นาที | ยิง `/api/warm` กัน cold start ของ Vercel — **ถอดออกได้เมื่อไม่ได้อยู่บน Vercel** |
| sync ยอดขาย 00:30 UTC (07:30 ไทย) | เรียก edge `sheets-sync` อ่าน Google Sheets → `sheet_sales_staging` → RPC `apply_sales_sheet_sync` → `sales_records` |

## 8. กติกาการพัฒนาที่ต้องรู้ก่อนแก้โค้ด

- **schema เปลี่ยน = ไฟล์ migration ใหม่ + แก้ `database.types.ts`** (ห้ามแก้ไฟล์ migration เก่า, ห้ามแก้ DB มือ) — เปลี่ยนความหมายของคอลัมน์เดิมต้อง UPDATE ย้ายข้อมูลเก่าในไฟล์เดียวกัน
- **supabase-js builder เป็น lazy thenable** — `await` หรือ `.then()` เสมอ ไม่งั้นไม่ยิง request (fire-and-forget ต้องมี `.then()` ปิดท้าย)
- `npm run lint` ต้องเขียว (CI บล็อค) — กฎ react-hooks ของ Next 16 (ห้าม setState ใน effect เพื่อ sync props → ใช้ `useSyncedState`, ห้าม `Date.now()` ระหว่าง render → helper ระดับโมดูลหรือรับ "วันนี้" จาก server)
- อัพโหลดไฟล์ผ่าน `prepareUploadFiles → tooLargeSummary → uploadWithProgress` เสมอ (ย่อรูป/บีบวิดีโอ H.264 ก่อนเช็คเพดาน 500MB)
- `select` ที่มี embed/join ต้องอยู่ในไฟล์ปกติ ไม่ใช่ไฟล์ `"use client"` (server component import แล้วพัง)
- UI primitives ใช้จาก `src/components/ui.tsx` เท่านั้น; label/สี/ค่าคงที่จาก `src/lib/constants.ts` หรือ `src/influ/lib/influ-constants.ts`
- ออกแบบทุกฟีเจอร์ให้ย้ายไป self-host ได้: ห้ามใช้บริการเฉพาะ Vercel, secret ผ่าน env/Vault, external integration ต้อง config/ปิดได้ (ดู `docs/DEPLOYMENT.md`)
- **UI ต้อง "สะอาด" (กติกาผู้ใช้ 2026-09-08):** ไม่มีคำอธิบายวิธีใช้ใต้ช่อง/หัวข้อ/empty-state, ไม่มี placeholder ตัวอย่าง (ช่องค้นหาใช้แค่ "ค้นหา", ช่องที่ไม่มี Label ใช้ placeholder เป็นคำนามสั้นๆ แทน Label) — สิ่งที่โชว์ได้คือข้อมูลจริง สถานะ เหตุผลที่ปุ่มกดไม่ได้ และคำเตือนผลกระทบที่ย้อนไม่ได้
- **trigger function ที่เป็น `security definer` ต้อง `revoke execute ... from public, anon, authenticated`** ในไฟล์ migration เดียวกัน และ policy ใหม่เขียน `(select auth.uid())` ไม่ใช่ `auth.uid()` ตรงๆ (ดู `0115_audit_hardening.sql`)
