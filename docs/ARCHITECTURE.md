# สถาปัตยกรรมระบบ

> อัปเดต 2026-09-08 (วันแยก repo ระบบ Influencer) — เอกสารนี้อธิบาย "ของที่มีอยู่จริง" ในโค้ด สำหรับคนที่เพิ่งเข้ามาอ่าน repo (ทีม IT / นักพัฒนาใหม่) ประวัติการตัดสินใจรายฟีเจอร์อยู่ใน `AGENTS.md`

## 1. ภาพรวม

```
ผู้ใช้ (มือถือ/เดสก์ท็อป, PWA)
   │  HTTPS
   ▼
แอปหลัก (repo นี้ · Next.js 16) ── proxy.ts ตรวจ session ทุก request ──┐
   ├─ (app)      ระบบ Team   ◄── src/influ-bridge/ (แตะข้อมูล Influ)   │
   ├─ (wellness) ระบบ Wellness                                          │
   └─ หน้าสาธารณะ: / (ประตู), /price-list                                │
                                                                       │
   ▼ supabase-js (anon key + cookie session)                            ▼
Supabase ─ Postgres 17 (RLS) ─ Auth ─ Storage `documents` ─ Realtime ─ Edge Functions ─ pg_cron/pg_net/Vault
   ▲
   ├─ แอป Influencer  repo `the-art-influencer` (โดเมนแยก — ตาราง influ_*, influencers, doctors)
   ├─ Sales Assistant (iPad, repo แยก, ตาราง sa_*)
   └─ Sales Queue queue.theartbb.com (repo แยก, ตาราง/RPC sq_*)
```

- **1 repo = 1 Next app** ที่มี 2 route group — route group ไม่โผล่ใน URL แต่แต่ละกลุ่มมี `layout.tsx` ของตัวเอง = โครงหน้า/เมนู/การตรวจสิทธิ์แยกกัน; ระบบ Influencer เคยเป็น route group ที่ 3 `(influ)` ที่นี่ จนแยกออกไปเป็น repo/แอปของตัวเองเมื่อ 2026-09-08 (ทางเข้าเหลือลิงก์ `INFLU_APP_URL`)
- **ไม่มี backend ของตัวเอง** — ทุกอย่างคุยกับ Supabase ตรงจากทั้ง server component และ client component; ตรรกะที่ต้องเชื่อถือได้อยู่ใน DB (trigger / RPC `security definer` / RLS) และใน edge function
- **ภาษา UI ไทยทั้งหมด, responsive ทั้งระบบ** (ทีมใช้จากมือถือเป็นหลัก) — กติกา UI อยู่ใน `AGENTS.md` หัวข้อ responsive

## 2. flow ของ request

1. `src/proxy.ts` (Next 16 ใช้แทน middleware) — ตรวจ JWT ด้วย `supabase.auth.getClaims()` (ตรวจในเครื่อง ไม่ยิง network) + refresh token; ไม่มี session → `/login`; path สาธารณะ (`/`, `/price-list`, `/api/warm`, `/manifest.webmanifest`, `/sw.js`, `/auth/callback`) ปล่อยผ่าน
2. `layout.tsx` ของ route group — อ่านผู้ใช้ + `getAccess()` (สิทธิ์จาก `profiles`) แล้ว render โครงหน้า (`sidebar.tsx` / `wellness-shell.tsx`)
3. `page.tsx` (server component) — ยิง query หลายก้อนขนานด้วย `Promise.all([getAccess(), ...])` แล้วเช็ค `hasPermission()`; ไม่มีสิทธิ์ = `<AccessNotice/>`; มี = ส่ง props ให้ `*-client.tsx`
4. client component — state + mutation ผ่าน `@/lib/supabase/client` แล้ว `router.refresh()` (มี client cache 30 วิ ใน `next.config.ts`); บางหน้าใช้ Realtime (บอร์ด Task, กระดิ่งแจ้งเตือน)
5. `/start` — เลือกหน้าแรกตามสิทธิ์: `data` → แดชบอร์ด, ระดับ influ* → **redirect ออกไปแอป Influencer**, `team` → `/tasks`, Wellness → `/wellness`, ไม่มีสิทธิ์ → หน้า "รออนุมัติสิทธิ์"

## 3. โมดูล

| โฟลเดอร์ | เนื้อหา | หมายเหตุ |
|---|---|---|
| `src/app/(app)/` | Team: `tasks` (บอร์ด Trello + ตรวจงาน 2 ลำดับ + brief + คิวโพส), `content-tracking`/`content-kpi` (KPI คอนเทนต์), `workload`, `all-media`, `files`, `my-tasks`, `dashboard` (ยอดขาย), `pricing`, `tag-management` (แท็ก + ทะเบียนหมอ), `accounts` (บัญชี/สิทธิ์ของทุกแอป), **`queue` (Sales Queue — คิวลูกค้าออนไลน์ของทีม BC รวมเข้ามา 2026-09-09: `queue`/`new`/`cases/[id]`/`team`/`ranking`/`audit` + แท็บ `queue-nav.tsx`; logic ใน `src/lib/queue/` มี unit test vitest `npm test`)** | โครงหน้า `src/components/sidebar.tsx` |
| `src/app/(wellness)/` | Wellness 1 บทบาท = 1 หน้า (`register`/`lab`/`contact`/`calendar`/`clinic`/`cases`/`[id]`) | ค่าคงที่ `src/lib/wellness-constants.ts`, component `src/components/wellness/` |
| `src/influ-bridge/` | สำเนาโค้ดชุดเล็กจาก repo Influ ที่ทีมคอนเทนต์ใช้: ตัวเลือกแท็ก influencer (`influ-tags.ts` server), แฮชแท็กบังคับ (`constants.ts`, `hashtag-chips.tsx`), ทะเบียนหมอเต็มชุด (`doctor-manager.tsx`, `doctor-select.tsx`), log (`influ-log.ts`) — **อ่าน/เขียนตารางของระบบ Influencer ตรง** | ดู README ในโฟลเดอร์; ผู้ใช้มีแค่ `/tasks` + `/tag-management` |
| `src/components/` | `ui.tsx` (primitives ทั้งหมด: Button/Card/Modal/Input/…), `access-notice`, `logo`, `profile-settings`, `notification-bell`, `anchored-menu.ts` (เมนูลอยที่ปลอดภัยบนมือถือ), `media-grid`, `report-viz` | |
| `src/lib/` | `supabase/{client,server}.ts`, `env.ts`, `access.ts` (server) + `permissions.ts` (client-safe — รวมระดับสิทธิ์ของแอป Influ เพราะตั้งจาก `/accounts` ที่นี่), `database.types.ts` + `types.ts` (รวม type ของตาราง influ เพราะ `tasks` join และ bridge ใช้), `constants.ts` (รวม `INFLU_APP_URL`), `format.ts` (`todayISO()` = "วันนี้เวลาไทย" ตัวเดียว), `upload.ts` + `upload-prepare.ts` + `video-compress.ts`, `push.ts` (Web Push), `use-*.ts` hooks | |

## 4. ข้อมูล: ตารางไหนเป็นของใคร

| กลุ่ม | ตาราง | เจ้าของ |
|---|---|---|
| ตัวตน/สิทธิ์ | `profiles`, `allowed_emails`, `allowed_email_domains`, `app_settings` | กลาง (จัดการที่ `/accounts`) |
| Team | `tasks` + `task_sections/comments/files/subtasks/subtask_files/categories/reviewers`, `content_categories`, `content_kpis`, `notifications`, `push_subscriptions`, `list_*` (My List ส่วนตัว), `analysis_links`, `file_links`, `documents` | ระบบ Team |
| ยอดขาย | `sales_records` (sync จาก Google Sheets ของทีม DA รายวัน), `sheet_sync_runs`, `sales_targets`, `staff_kpis`, `admin_records`, `data_imports` | Team (`/dashboard`) |
| ราคา | `price_items` (ราคาอ้างอิงกลาง — Influ/Sales Assistant อ้าง), `promo_packages` + `promo_package_items` (โปรที่ขึ้น `/price-list`), `price_promotions` (ไม่ได้ใช้ 0 แถว) | Team (`/pricing`) |
| Wellness | `wellness_customers`, `wellness_lab_files`, `wellness_appointments` | ระบบ Wellness |
| Influencer | `influencers`, `influ_*` (profiles/prospects/procedure_items/calendar_events/assignees/post_links/tasks/campaign_defs/…/activity_log/notifications/deleted_backups), `doctors` | **แอป Influencer (repo แยก)** — แอปนี้อ่าน `influencers`/`doctors`/`influ_procedure_items`/`influ_campaign_defs` และเขียน `doctors`/`influ_activity_log` ผ่าน `src/influ-bridge/` |
| แอปอื่น | `sa_*` (+ trigger `promo_mirror_*` ที่คัดลอกโปรจาก `promo_packages` ไปให้) | Sales Assistant (repo แยก) — ห้ามแตะ |
| แอปอื่น | `sq_*` (+ RPC `sq_*`) | Sales Queue `queue.theartbb.com` (repo แยก) — ห้ามแตะ |

**จุดที่ข้ามระบบกันใน DB (ทั้งหมดมีแค่นี้ — ทุกเส้น SET NULL):**
- แอปนี้ → Influ: `tasks.influencer_id` → `influencers`, `tasks.doctor_id` → `doctors` (งานคอนเทนต์ติดแท็กว่าเป็นของ influ/หมอคนไหน)
- Influ → แอปนี้: `influ_procedure_items.price_item_id` → `price_items`, `influ_procedure_items.promo_package_id` → `promo_packages` (เมนูหัตถการ + รหัสโปรสำหรับแฮชแท็ก) — **2 ตารางนี้ห้ามลบ**
- ทุกระบบอ่าน `profiles` (ชื่อ/รูป/สิทธิ์)

**migrations** ของ DB ที่ใช้ร่วมกันอยู่ที่ repo นี้ (`supabase/migrations/0001..N` — canonical ตั้งแต่ 2026-09-09; repo Influ มีแต่ README ชี้มา); ดู `supabase/README.md`

ตารางที่ยังอยู่แต่ไม่มี UI แล้ว (เก็บข้อมูลเก่า): `price_promotions`, `documents`, `data_imports` (ของ Influ: `influ_followups`, `influ_campaigns`, `influ_signatures`)

## 5. สิทธิ์และตัวตน

- Supabase Auth — บัญชีสร้างโดยผู้ดูแล (edge function `admin-users` ใช้ service role) หรืออีเมลโดเมนบริษัทผ่าน Google; trigger `handle_new_user` ปฏิเสธคนที่ไม่อยู่ใน allowlist
- สิทธิ์ = `profiles.permissions text[]` + `profiles.role` — เช็คที่ชั้นแอป (`getAccess()`/`hasPermission()`/`canXxx()`) **RLS ส่วนใหญ่เปิดให้ authenticated ทั้งหมด** จึงต้องถือว่าทุกบัญชีที่ล็อกอินได้อ่านข้อมูลทั้งฐานได้ผ่าน REST (เหตุผลที่ปิดการสมัครเองและเปิดเฉพาะ Google สำหรับโดเมนบริษัท)
- ของที่ DB กันจริง: ตารางส่วนตัว (`list_*`, `push_subscriptions`, `influ_notifications`) มี RLS ต่อเจ้าของ, RPC ของ Influ มี guard ระดับสิทธิ์ใน `security definer`
- แอป Influencer ใช้ Supabase Auth ตัวเดียวกัน (บัญชี/สิทธิ์ชุดเดียว ตั้งจาก `/accounts` ที่นี่) แต่คุกกี้ session อยู่คนละโดเมน — ล็อกอินแยกกันจนกว่าจะอยู่ใต้โดเมนเดียวกัน + ตั้ง cookie domain ร่วม

## 6. แจ้งเตือน

| ระบบ | ตาราง | ส่งจาก | Push |
|---|---|---|---|
| Team | `notifications` (+ `seen_at`/`read_at`) | client ตอนเกิดเหตุการณ์ (`notify()` ใน tasks-client) | trigger `notifications_push_after_insert` → edge `send-push` (เฉพาะ `priority='primary'`) |
| Influencer | `influ_notifications` | แอป Influ | trigger → edge `send-push` เดียวกัน (`body.source='influ'`) — ต่อ URL เต็มของแอป Influ จาก Vault `influ_app_url` เพราะอุปกรณ์อาจสมัคร push จากกระดิ่งของแอปนี้ |

Web Push: service worker `public/sw.js` (มีไว้เพื่อ push เท่านั้น ไม่มี cache), ทะเบียนอุปกรณ์ `push_subscriptions` (ผูก user ไม่ผูกแอป), คีย์ VAPID สาธารณะใน `app_settings.vapid_public_key` / คีย์ลับใน Vault; โค้ด `send-push` mirror อยู่ repo Influ

## 7. งานตามเวลา (pg_cron)

| job | ทำอะไร |
|---|---|
| `vercel-warm-ping` ทุก 5 นาที | ยิง `/api/warm` กัน cold start ของ Vercel — **ถอดออกได้เมื่อไม่ได้อยู่บน Vercel** |
| sync ยอดขาย 00:30 UTC (07:30 ไทย) | เรียก edge `sheets-sync` อ่าน Google Sheets → `sheet_sales_staging` → RPC `apply_sales_sheet_sync` → `sales_records` |

## 8. กติกาการพัฒนาที่ต้องรู้ก่อนแก้โค้ด

- **schema เปลี่ยน = ไฟล์ migration ใหม่ใน `supabase/migrations/` ของ repo นี้ (canonical ของ DB ร่วม — รวมฟีเจอร์ของ Influ ด้วย) + แก้ `database.types.ts` ของทั้ง 2 repo** (ห้ามแก้ไฟล์ migration เก่า, ห้ามแก้ DB มือ) — เปลี่ยนความหมายของคอลัมน์เดิมต้อง UPDATE ย้ายข้อมูลเก่าในไฟล์เดียวกัน
- **supabase-js builder เป็น lazy thenable** — `await` หรือ `.then()` เสมอ ไม่งั้นไม่ยิง request (fire-and-forget ต้องมี `.then()` ปิดท้าย)
- `npm run lint` ต้องเขียว (CI บล็อค) — กฎ react-hooks ของ Next 16 (ห้าม setState ใน effect เพื่อ sync props → ใช้ `useSyncedState`, ห้าม `Date.now()` ระหว่าง render → helper ระดับโมดูลหรือรับ "วันนี้" จาก server)
- อัพโหลดไฟล์ผ่าน `prepareUploadFiles → tooLargeSummary → uploadWithProgress` เสมอ (ย่อรูป/บีบวิดีโอ H.264 ก่อนเช็คเพดาน 500MB)
- `select` ที่มี embed/join ต้องอยู่ในไฟล์ปกติ ไม่ใช่ไฟล์ `"use client"` (server component import แล้วพัง)
- UI primitives ใช้จาก `src/components/ui.tsx` เท่านั้น; label/สี/ค่าคงที่จาก `src/lib/constants.ts`
- **โค้ดที่แตะข้อมูลของระบบ Influencer อยู่ `src/influ-bridge/` ที่เดียว** — กติกาแฮชแท็ก/ทีม product/ชื่อหมอมีต้นฉบับที่ repo Influ เปลี่ยนที่นั่นต้องมาแก้สำเนา; ห้ามเพิ่มหน้า/โค้ดของระบบ Influ กลับมาที่ repo นี้
- ออกแบบทุกฟีเจอร์ให้ย้ายไป self-host ได้: ห้ามใช้บริการเฉพาะ Vercel, secret ผ่าน env/Vault, external integration ต้อง config/ปิดได้ (ดู `docs/DEPLOYMENT.md`)
- **UI ต้อง "สะอาด" (กติกาผู้ใช้ 2026-09-08):** ไม่มีคำอธิบายวิธีใช้ใต้ช่อง/หัวข้อ/empty-state, ไม่มี placeholder ตัวอย่าง (ช่องค้นหาใช้แค่ "ค้นหา", ช่องที่ไม่มี Label ใช้ placeholder เป็นคำนามสั้นๆ แทน Label) — สิ่งที่โชว์ได้คือข้อมูลจริง สถานะ เหตุผลที่ปุ่มกดไม่ได้ และคำเตือนผลกระทบที่ย้อนไม่ได้
- **trigger function ที่เป็น `security definer` ต้อง `revoke execute ... from public, anon, authenticated`** ในไฟล์ migration เดียวกัน และ policy ใหม่เขียน `(select auth.uid())` ไม่ใช่ `auth.uid()` ตรงๆ (ดู `0115_audit_hardening.sql` ใน repo Influ)
