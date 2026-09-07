# The ART Aesthetic — ระบบหลังบ้านแผนก Aesthetic

ระบบภายในของโรงพยาบาลศัลยกรรม The ART (แผนก Aesthetic) — เว็บแอป Next.js ตัวเดียวที่มี **3 ระบบย่อย** (ผู้ใช้/สิทธิ์แยกกัน) และหน้าสาธารณะอีก 2 หน้า ใช้ **Supabase** (Postgres + Auth + Storage) เป็น backend ร่วมกัน

| ระบบ | โค้ดอยู่ที่ | ผู้ใช้ | ทำอะไร |
|---|---|---|---|
| **Influencer System** | `src/app/(influ)/` + `src/influ/` | ทีมการตลาด (Influ) | ดูแล influencer ตั้งแต่ล่ารายชื่อ → เปิดเคส → Memo ขออนุมัติ → สัญญา/วันรับบริการ → ติดตามโพส · ปฏิทินคิว · ต้นทุน · แคมเปญ/แฮชแท็ก · แดชบอร์ด — **ระบบหลักที่จะผูก API กับระบบอื่นของบริษัท และย้ายไปรันบน server ของบริษัท** (ดู [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)) |
| **Team** | `src/app/(app)/` | ทีมคอนเทนต์ / ผู้บริหาร | บอร์ดงาน + ตรวจงาน + คิวโพส, KPI คอนเทนต์, คลังไฟล์, My List, แดชบอร์ดยอดขาย, หลังบ้าน Price List, จัดการบัญชี/สิทธิ์ |
| **Wellness** | `src/app/(wellness)/` | BC / Lab / Admin / แพทย์ | คิวลูกค้า wellness: ลงทะเบียน → ผลเลือด → โทรนัด → ลงคิว → ตรวจ |
| หน้าสาธารณะ | `src/app/page.tsx`, `src/app/price-list/` | ทุกคน (ไม่ต้องล็อกอิน) | หน้าประตูรวมช่องทาง (`/`) และ Price List (`/price-list`) |

## Stack

- **Next.js 16** (App Router, โฟลเดอร์ `src/`, Turbopack) · React 19 · TypeScript strict · Tailwind CSS v4
- **Supabase**: Postgres 17 · Auth (อีเมล/รหัสผ่าน + Google) · Storage (bucket `documents`) · Edge Functions (Deno) · Realtime · pg_cron / pg_net / Vault
- Recharts (กราฟ) · lucide-react (ไอคอน) · dnd-kit (ลากวาง) · mediabunny (บีบวิดีโอในเบราว์เซอร์) · Playwright (e2e)
- Deploy ปัจจุบัน: **Vercel** (auto-deploy จาก branch `main`) + **Supabase cloud** (ap-southeast-2) — โดเมน `theartbb.com`

## เริ่มพัฒนาบนเครื่อง

ต้องมี Node.js 22 + npm

```bash
git clone https://github.com/MediaforgeThailand/the-art-aesthetic.git
cd the-art-aesthetic
npm ci
npm run dev        # http://localhost:3000
```

ไม่ต้องสร้าง `.env.local` ก็รันได้ — `src/lib/env.ts` มีค่า publishable key ของ Supabase cloud เป็น fallback (เป็น anon key เปิดเผยได้ ไม่ใช่ความลับ) ถ้าจะชี้ Supabase instance อื่น ตั้ง 2 ตัวนี้:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | build โปรดักชัน (มี type-check ในตัว) — CI รันทุก push/PR |
| `npm run lint` | ESLint — CI บล็อคถ้ามี error (รวมกฎขอบเขตโมดูล ดูด้านล่าง) |
| `npm run test:e2e` | Playwright กวาดทุกหน้า 2 ขนาดจอ (ต้องตั้ง `E2E_EMAIL`/`E2E_PASSWORD` — dev server ชี้ DB จริง เทสต์จึงเปิด-ปิดอย่างเดียว ไม่ submit) |
| `npm run icons` | สร้างไอคอน PWA ใหม่จาก `scripts/gen-icons.mjs` |

## โครงสร้างโค้ด

```
src/
  app/
    (app)/         # ระบบ Team — แต่ละโฟลเดอร์ = 1 หน้า (page.tsx = server, *-client.tsx = client)
    (influ)/       # ระบบ Influencer — route ทั้งหมด (+ component ที่วางคู่กับหน้า)
    (wellness)/    # ระบบ Wellness
    page.tsx       # หน้าประตู (สาธารณะ)   price-list/  # Price List (สาธารณะ)
    login/  start/  auth/callback/  api/warm/  manifest.ts
  influ/           # ของกลางของระบบ Influencer ที่ไม่ใช่ route
    lib/           #   ค่าคงที่ กติกาธุรกิจ (stage, tier, voucher, hashtag) log แจ้งเตือน
    components/    #   โครงหน้า (shell) กระดิ่ง ตัวกรอง ลายเซน
    public/        #   "หน้าต่าง" ที่ฝั่ง Team ใช้ได้ (ตัวเลือกแท็ก influ/หมอ, แฮชแท็ก)
  components/      # UI primitives (ui.tsx) + โครงหน้าของ Team/Wellness + ของกลาง
  lib/             # supabase client/server, สิทธิ์ (access/permissions), format, upload, constants
  lib/database.types.ts   # types ตรงกับ schema (เขียนมือ ต้องแก้คู่กับ migration)
  proxy.ts         # auth guard ทุก request (Next 16 ใช้ proxy.ts แทน middleware.ts)
supabase/
  migrations/      # schema ทั้งหมด 0001..N — apply เรียงบน Supabase stack เปล่าได้
  functions/       # edge functions: admin-users, domain-auth, send-push, sheets-sync
e2e/               # Playwright specs
scripts/           # สคริปต์นำเข้าข้อมูล (Price List/โปร) + สร้างไอคอน
docs/              # เอกสารสถาปัตยกรรม / จุดผูก API / การ deploy
```

**กฎขอบเขตโมดูล (บังคับด้วย ESLint):** โค้ดนอกระบบ Influencer import จาก Influ ได้เฉพาะ `@/influ/public/*` และระบบ Influencer ห้าม import โค้ดของ Team/Wellness — เพื่อให้ระบบ Influencer แยกออกไปเป็น repo ของตัวเองได้ในอนาคตโดยไม่ต้องแกะ รายละเอียดที่ [src/influ/README.md](src/influ/README.md)

## ฐานข้อมูลและ backend

- **Schema = ไฟล์ migration เท่านั้น** (`supabase/migrations/0001..N`) — ทุกการเปลี่ยน schema ต้องมีไฟล์ migration และแก้ `src/lib/database.types.ts` ให้ตรง ห้ามแก้ DB ด้วยมือโดยไม่มีไฟล์ (ชุดนี้ replay ได้บน Supabase stack เปล่า ทั้ง cloud และ self-host)
- **Edge functions** (mirror ที่ `supabase/functions/`): `admin-users` (จัดการบัญชี — service role), `domain-auth` (เช็คอีเมลตอนล็อกอิน), `send-push` (Web Push), `sheets-sync` (ดึงยอดขายจาก Google Sheets รายวัน)
- **Secrets ไม่อยู่ใน repo** — เก็บใน Supabase Vault (คีย์ Google service account, VAPID, secret ของ function) และ env ของ edge function; รายการครบอยู่ใน [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Storage**: bucket `documents` — ไฟล์ของ Task (`tasks/`), Influencer (`influencers/`, `influ-profiles/`, `doctors/`, `templates/`), Wellness (`wellness/`), My List (`my-tasks/`)
- **RLS**: ตารางส่วนใหญ่เป็น "ผู้ใช้ที่ล็อกอินเข้าถึงได้ทั้งหมด" โดยตั้งใจ (ระบบภายในแผนก) — สิทธิ์การมองเห็น/แก้ไขคุมที่ชั้นแอปผ่าน `permissions` ยกเว้นตารางส่วนตัว (`list_*`, `push_subscriptions`, `influ_notifications`) และถังขยะ/RPC ของ Influ ที่มี guard ใน DB
- ตาราง `sa_*` เป็นของแอป **Sales Assistant** (repo แยก, ใช้ DB เดียวกัน) — ระบบนี้ไม่แตะ ห้ามลบ

## การเข้าระบบและสิทธิ์

- **สมัครเองไม่ได้** — บัญชีถูกสร้างจากหน้า `/accounts` โดยผู้ดูแล หรืออีเมลโดเมนบริษัทล็อกอินผ่าน Google แล้วรออนุมัติสิทธิ์ (trigger `handle_new_user` + ตาราง `allowed_emails` / `allowed_email_domains`)
- สิทธิ์เป็นสวิตช์อิสระต่อบัญชีใน `profiles.permissions` (`data`, `team`, `pricing`, `doctor_manage`, ระดับ Influencer 3 ระดับ `influ_view`/`influ_hunter`/`influ`, Wellness 4 บทบาท) + `profiles.role = 'admin'` สำหรับจัดการบัญชี — นิยามที่ `src/lib/permissions.ts` ทุกหน้า server-guard ด้วย `getAccess()` + `hasPermission()`
- หน้าแรกหลังล็อกอิน (`/start`) ส่งไปยังระบบตามสิทธิ์ที่มี

## Deploy / ย้ายไป server ของบริษัท

ตอนนี้ push `main` = Vercel deploy อัตโนมัติ (CI ต้อง build + lint ผ่านก่อน) ขั้นตอน self-host, สิ่งที่ต้องเตรียม, และของที่ไม่ย้ายตาม 1:1 อยู่ใน [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## เอกสาร

| ไฟล์ | สำหรับ |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | ภาพรวมสถาปัตยกรรม, โมดูล, ตารางใครเป็นเจ้าของ, flow ของ request |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | **จุดผูก API ของระบบ Influencer กับระบบอื่นของบริษัท** (E-document, ลงคิว, ทะเบียนหมอ, SSO) — สำหรับทีม IT |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | topology ปัจจุบัน, env/secrets, ขั้นตอน self-host, checklist หลังย้าย |
| [src/influ/README.md](src/influ/README.md) | ขอบเขตโมดูล Influencer + แผนแยก repo |
| [AGENTS.md](AGENTS.md) | บันทึกการทำงานสะสมของ AI agent ที่พัฒนาระบบ (ละเอียดมาก ตามลำดับ migration) — ใช้เป็น **ประวัติการตัดสินใจ** ไม่ใช่สเปก |
