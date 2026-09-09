# การ deploy และการย้ายไปรันบน server ของบริษัท

> อัปเดต 2026-09-09 (โมเดล 2 ระบบ: migrations + edge functions ทั้งชุดเป็น canonical ที่ repo นี้, Sales Queue รวมเข้ามาเป็น `/queue`; เอกสาร self-host ของแอป Influencer อยู่ที่ repo `the-art-influencer`) — ส่วนที่ 1 คือของที่รันอยู่จริงตอนนี้ ส่วนที่ 2-4 คือสิ่งที่ต้องเตรียมเมื่อย้าย (ยังไม่ได้ซ้อมย้ายจริง — ควรซ้อมบน Docker ในเครื่องก่อนวันจริง ดูข้อ 5)

## 1. topology ปัจจุบัน

| ส่วน | ที่อยู่ | หมายเหตุ |
|---|---|---|
| เว็บแอป (Next.js) | **Vercel** โปรเจกต์ `the-art-aesthetic` region `syd1` (ใกล้ DB) — auto-deploy เมื่อ push `main`; CI (`.github/workflows/ci.yml`) ต้อง build + lint ผ่าน | โดเมน `www.theartbb.com` / `theartbb.com` (DNS ที่ GoDaddy) + `the-art-aesthetic.vercel.app` |
| แอป Influencer (repo `the-art-influencer`) | Vercel โปรเจกต์ `the-art-influencer` — `https://the-art-influencer.vercel.app` (ผู้ใช้ 2026-09-09: ใช้โดเมน Vercel ไปก่อน จะไม่มี `influ.theartbb.com` จนกว่าจะได้โดเมนบริษัทจริง — ล็อกอินแยกจากแอปนี้) | ใช้ Supabase ตัวเดียวกัน; ทางเข้าจากแอปนี้ = `INFLU_APP_URL` ใน `src/lib/constants.ts` — ย้ายโดเมนแก้ค่านี้ + Vault `influ_app_url` + Redirect URLs |
| ฐานข้อมูล/Auth/Storage | **Supabase cloud** โปรเจกต์ `TheArtAesthetic` (`zcoqzasbtgfccuibteji`, region ap-southeast-2 Sydney) | Postgres 17 · Storage เพดานไฟล์ 500MB (ตั้งที่ Dashboard → Storage → Settings) |
| Edge functions | Supabase (Deno) — `admin-users` (verify_jwt เปิด), `domain-auth` (ปิด — เรียกก่อนล็อกอิน), `send-push` (ปิด — ใช้ header `x-push-secret`), `sheets-sync` (ปิด — ใช้ header `x-sync-secret`) | โค้ด mirror ทั้ง 4 ตัวอยู่ `supabase/functions/` ของ repo นี้ (canonical ตั้งแต่ 2026-09-09 — repo Influ ไม่มีสำเนาแล้ว) — deploy ด้วย Supabase CLI/MCP |
| งานตามเวลา | pg_cron ใน DB: `vercel-warm-ping` (ทุก 5 นาที → `/api/warm`), sync ยอดขาย 00:30 UTC (→ edge `sheets-sync`) | |
| ล็อกอิน Google | Google Cloud OAuth client → callback `https://zcoqzasbtgfccuibteji.supabase.co/auth/v1/callback`; Supabase Auth → Redirect URLs ต้องมีทุกโดเมนของแอป | ปุ่มโผล่เองเมื่อ provider เปิด (แอปอ่าน `/auth/v1/settings`) |
| แอปพี่น้อง (repo แยก) | Sales Assistant `https://sales.theartbb.com/salestool/` (ใช้ Supabase เดียวกัน ตาราง `sa_*`) — Sales Queue รวมเข้าแอปนี้เป็น `/queue` แล้ว 2026-09-09 (Vercel project `the-art-sales-queue` + โดเมน `queue.theartbb.com` เลิกใช้ ลบทิ้งได้ ไม่ย้ายโดเมนมา) | ลิงก์ถึงกันผ่านค่าใน `src/lib/constants.ts` |

## 2. ค่า config และความลับทั้งหมด

**env ของแอป (มีแค่ 2 ตัว):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — ไม่ตั้ง = ใช้ fallback ของ cloud ใน `src/lib/env.ts`

**Supabase Vault** (อ่านได้เฉพาะ service role ผ่าน `get_app_secret()` — ไม่มีใน repo):

| ชื่อ secret | ใช้โดย |
|---|---|
| `google_sa_key` | edge `sheets-sync` — service account อ่าน Google Sheets ของทีม DA |
| `sheets_sync_secret`, `sheets_sync_function_url` | pg_cron เรียก `sheets-sync` |
| `vapid_private_key`, `vapid_subject`, `push_secret`, `push_function_url` | trigger ส่ง Web Push → edge `send-push` |
| `influ_app_url` | edge `send-push` ต่อ URL เต็มให้แจ้งเตือนของแอป Influencer (ต้องตรงกับ `INFLU_APP_URL`) |

**`app_settings`** (ตารางปกติ): `vapid_public_key` (คู่กับคีย์ลับใน Vault — ออกใหม่ต้องเปลี่ยนคู่กัน), `default_reviewer_id`/`default_reviewer1b_id`/`default_reviewer2_id` (ผู้ตรวจงาน), `kpi_reset_at`

**env ของ edge functions:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase ใส่ให้เอง) — `admin-users` ใช้ service role สร้าง/ลบบัญชี

**นอก Supabase:** Google OAuth Client ID/Secret (ใส่ใน Supabase Auth → Providers), บัญชี Google ที่ถือ Apps Script snapshot ชีทยอดขาย, DNS ที่ GoDaddy

## 3. ทางเลือกในการย้าย

| แบบ | คืออะไร | เหมาะเมื่อ |
|---|---|---|
| **A. แอปบน server บริษัท + Supabase cloud เดิม** | รัน Next.js เอง (Node 22 หรือ Docker) ชี้ Supabase cloud ต่อ | ทำได้ทันที ต้องมี outbound HTTPS ไป `*.supabase.co`; ข้อมูลยังอยู่ Sydney |
| **B. self-host Supabase ทั้ง stack** | Docker Compose ของ Supabase (Postgres + GoTrue + PostgREST + Storage + Realtime + Edge runtime + Studio) บน server บริษัท แล้วแอปชี้ไปที่นั่น | on-prem / air-gapped จริง — ต้องดูแล stack เอง (backup, upgrade) |

โค้ดแอปไม่ต้องแก้ทั้ง 2 แบบ (ไม่ได้ใช้บริการเฉพาะ Vercel — `vercel.json` มีแค่ region) แค่เปลี่ยน env

## 4. ขั้นตอนแบบ B (self-host เต็ม)

1. **ตั้ง stack**: `supabase/docker` (docker-compose อย่างเป็นทางการ) — Postgres 17 image ของ Supabase มี `pg_cron`, `pg_net`, `supabase_vault` มาให้แล้ว (migration ชุดนี้ต้องการ schema `storage` และ `vault` — **รันบน Postgres เปล่าไม่ได้**); ตั้ง JWT secret + anon/service key ใหม่, `SITE_URL` = โดเมนแอป
2. **สร้าง schema**: apply `supabase/migrations/0001..N` ของ repo นี้ (ชุด canonical ของ DB ร่วม — กลับมาจาก repo Influ เมื่อ 2026-09-09) เรียงลำดับ — `supabase db push --db-url "$DB_URL"` หรือ `psql -v ON_ERROR_STOP=1 -f` ทีละไฟล์ (เคย audit แล้วว่า replay บน stack เปล่าผ่าน)
3. **ย้ายข้อมูล**: `pg_dump --data-only` ของ schema `public` + `auth` (ต้องเก็บ `auth.users.id` เดิม เพราะ `profiles`/FK ทั้งระบบชี้ id นี้) + `storage.buckets/objects`; ไฟล์จริงใน bucket `documents` ต้องคัดลอกผ่าน Storage API (list → download → upload) ไม่ใช่ SQL — ประมาณ 1-2 GB
4. **Edge functions**: deploy 4 ตัวจาก `supabase/functions/` ของ repo นี้ (`sheets-sync`/`admin-users`/`domain-auth`/`send-push`) ไปที่ edge runtime ของ stack ใหม่ (ตั้ง verify_jwt ตามตารางข้อ 1) แล้ว **ใส่ Vault secrets ใหม่** (`push_function_url`/`sheets_sync_function_url` เปลี่ยนเป็นโดเมนใหม่; VAPID ใช้คู่เดิมได้ อุปกรณ์ที่สมัคร push ไว้จะยังใช้ได้)
5. **pg_cron**: สร้าง job sync ยอดขายใหม่ (ถ้ายังใช้) และ **ไม่ต้องสร้าง `vercel-warm-ping`** (ของ Vercel เท่านั้น)
6. **Auth**: Google provider (สร้าง OAuth client ใหม่ callback = `https://<supabase-host>/auth/v1/callback`), Redirect URLs = โดเมนแอปใหม่, ปิด email signup ได้เลย (trigger `handle_new_user` กันอยู่แล้ว) — ระบบไม่พึ่ง SMTP (สร้างบัญชีแบบ `email_confirm=true` จาก `/accounts`)
7. **Storage**: ตั้งเพดานไฟล์ 500MB ผ่าน Studio/Storage API (**ห้าม update ตาราง `storage.buckets` ด้วย SQL** — เคยทำให้อัปโหลดพังทั้งระบบ), เลือก backend เป็น local disk หรือ S3-compatible
8. **แอป**: `npm ci && npm run build && npm run start` (Node 22) หลัง nginx ที่มี TLS + รองรับ WebSocket (Realtime) — env 2 ตัวชี้ stack ใหม่; ยังไม่มี `Dockerfile` ใน repo (เพิ่มได้ด้วย `output: "standalone"` ของ Next ถ้า IT ต้องการ image)
9. **DNS/TLS** ชี้โดเมนมาที่ server; ถ้าใช้โดเมนเดิม ให้แก้ Redirect URLs/OAuth ให้ครบก่อนสลับ

### ของที่ไม่ย้ายตาม 1:1 (ต้องตัดสินใจล่วงหน้า)

- **Google Sheets sync ยอดขาย** — ต้องออก internet + service account; air-gapped = ปิด job แล้วนำเข้าไฟล์เอง
- **Web Push** — server ต้องยิงออกไป push service ของ Google/Apple/Mozilla ได้; air-gapped = แจ้งเตือนในแอปยังทำงาน แต่ไม่เด้งบนอุปกรณ์
- **ล็อกอิน Google** — ต้องออก internet ไป Google; ถ้าไม่ได้ ใช้อีเมล+รหัสผ่านที่ผู้ดูแลตั้งให้ (มีอยู่แล้ว) หรือผูก SSO ของบริษัท
- **cold start** — ไม่มีเพราะรัน Node ค้างไว้ (job `vercel-warm-ping` ไม่ต้องมี)
- **Supabase Studio** — ใช้ดู/แก้ข้อมูลแทน Dashboard cloud; งาน "จัดการบัญชี" ทำจากหน้า `/accounts` ในแอปเหมือนเดิม

## 5. ควรซ้อมก่อนย้ายจริง

รัน Supabase ในเครื่องด้วย `supabase start` (Docker) แล้ว: (1) apply migration ทั้งชุด (2) restore ข้อมูลตัวอย่าง (3) deploy edge functions ไป local (4) ชี้แอปด้วย env 2 ตัว (5) รัน `npm run test:e2e` — จุดที่มักพัง: Vault/secrets, URL ของ edge function ใน Vault, Redirect URLs ของ Auth, เพดานไฟล์ Storage, WebSocket ผ่าน proxy

## 6. checklist หลังย้าย

- [ ] ล็อกอินได้ทั้งอีเมล/รหัสผ่าน และ Google (ถ้าเปิด) → เด้งเข้า `/start` ถูกระบบ
- [ ] `/accounts` สร้างบัญชี/ตั้งสิทธิ์ได้ (edge `admin-users`)
- [ ] อัปโหลดไฟล์ในงาน Task และเคส Influ ได้ (Storage) และเปิดดูได้ (signed URL)
- [ ] บอร์ด `/tasks` อัปเดต realtime เมื่อเปิด 2 เครื่อง
- [ ] กระดิ่งแจ้งเตือน + Web Push (ถ้าเปิด) เด้ง
- [ ] job sync ยอดขายรันแล้ว `sheet_sync_runs` มีแถวใหม่ (ถ้าเปิด)
- [ ] `/price-list` และ `/` เปิดได้โดยไม่ล็อกอิน
- [ ] `npm run test:e2e` ผ่านทั้ง 2 ขนาดจอ

## 7. การแก้ระบบหลังส่งมอบ

- โค้ด: git (`main`) → CI build+lint → IT deploy ใหม่ (pull → `npm ci` → `npm run build` → restart)
- schema: นักพัฒนาเขียน **ไฟล์ migration ใหม่** ใน `supabase/migrations/` ของ repo นี้ (ระบบ Influ ที่ยังใช้ DB ร่วมกันก็เขียนที่นี่) + แก้ `database.types.ts` ของทั้ง 2 repo → IT รัน `supabase migration up` / `psql -f` บน DB ของบริษัท (ไม่มีใครแก้ DB ด้วยมือ)
- edge function: แก้ใน `supabase/functions/` → `supabase functions deploy <name>`
- ถ้าให้นักพัฒนาต่อ DB ผ่าน VPN ได้ ขั้นตอน schema ทำเองได้เหมือนตอนอยู่ cloud (ใช้ CLI/psql แทน Supabase MCP)
