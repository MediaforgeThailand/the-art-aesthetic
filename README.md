# The ART Aesthetic — ระบบหลังบ้านแผนก Aesthetic

ระบบภายในของโรงพยาบาลศัลยกรรม The ART (แผนก Aesthetic) — เว็บแอป Next.js ที่มี **2 ระบบย่อย** (ผู้ใช้/สิทธิ์แยกกัน) และหน้าสาธารณะอีก 2 หน้า ใช้ **Supabase** (Postgres + Auth + Storage) เป็น backend ร่วมกับแอปพี่น้อง

| ระบบ | โค้ดอยู่ที่ | ผู้ใช้ | ทำอะไร |
|---|---|---|---|
| **Team** | `src/app/(app)/` | ทีมคอนเทนต์ / ผู้บริหาร | บอร์ดงาน + ตรวจงาน + คิวโพส, KPI คอนเทนต์, คลังไฟล์, My List, แดชบอร์ดยอดขาย, หลังบ้าน Price List, จัดการแท็ก (รวมทะเบียนหมอ), จัดการบัญชี/สิทธิ์ของทุกแอป |
| **Wellness** | `src/app/(wellness)/` | BC / Lab / Admin / แพทย์ | คิวลูกค้า wellness: ลงทะเบียน → ผลเลือด → โทรนัด → ลงคิว → ตรวจ |
| **Sales Queue** | `src/app/(app)/queue/` + `src/lib/queue/` | ทีม Beauty Consult (สิทธิ์ `sales_queue`; บทบาท BC / แอดมิน / ผู้ดูอย่างเดียวใน `sq_members`) | แจกคิวลูกค้าออนไลน์ให้ BC อัตโนมัติตามน้ำหนักอันดับ Drag รายเดือน — รวมเข้าแอปนี้ 2026-09-09 (เดิม `queue.theartbb.com` ใน repo Sales Assistant); logic มี unit test `npm test` |
| หน้าสาธารณะ | `src/app/page.tsx`, `src/app/price-list/` | ทุกคน (ไม่ต้องล็อกอิน) | หน้าประตูรวมช่องทาง (`/`) และ Price List (`/price-list`) |
| **Influencer System** | repo แยก **[`the-art-influencer`](https://github.com/MediaforgeThailand/the-art-influencer)** (ตั้งแต่ 2026-09-08) | ทีมการตลาด Influ | ดูแล influencer ตั้งแต่ล่ารายชื่อ → เปิดเคส → Memo → สัญญา → ติดตามโพส — **ระบบที่จะส่งมอบให้ทีม IT ผูก API และย้ายไป server บริษัท**; ใช้ Supabase ตัวเดียวกับที่นี่ ทางเข้าจากหน้าประตู/sidebar ชี้ไป `INFLU_APP_URL` (`src/lib/constants.ts`) |

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
| `npm run lint` | ESLint — CI บล็อคถ้ามี error |
| `npm run test:e2e` | Playwright กวาดทุกหน้า 2 ขนาดจอ (ต้องตั้ง `E2E_EMAIL`/`E2E_PASSWORD` — dev server ชี้ DB จริง เทสต์จึงเปิด-ปิดอย่างเดียว ไม่ submit) |
| `npm run icons` | สร้างไอคอน PWA ใหม่จาก `scripts/gen-icons.mjs` |

## โครงสร้างโค้ด

```
src/
  app/
    (app)/         # ระบบ Team — แต่ละโฟลเดอร์ = 1 หน้า (page.tsx = server, *-client.tsx = client)
    (wellness)/    # ระบบ Wellness
    page.tsx       # หน้าประตู (สาธารณะ)   price-list/  # Price List (สาธารณะ)
    login/  start/  auth/callback/  api/warm/  manifest.ts
  influ-bridge/    # สำเนาโค้ดชุดเล็กที่ทีมคอนเทนต์ใช้แตะข้อมูลของระบบ Influencer (ตัวเลือกแท็ก influ/หมอ,
                   # แฮชแท็ก, ทะเบียนหมอ) — อ่าน/เขียนตารางของระบบนั้นตรงผ่าน Supabase ตัวเดียวกัน (ดู README ในโฟลเดอร์)
  components/      # UI primitives (ui.tsx) + โครงหน้าของ Team/Wellness + ของกลาง
  lib/             # supabase client/server, สิทธิ์ (access/permissions), format, upload, constants
  lib/database.types.ts   # types ตรงกับ schema ของ DB ที่ใช้ร่วมกัน (เขียนมือ ต้องแก้คู่กับ migration)
  proxy.ts         # auth guard ทุก request (Next 16 ใช้ proxy.ts แทน middleware.ts)
supabase/
  README.md        # migrations ย้ายไป repo the-art-influencer แล้ว (ชุด canonical ของ DB ที่ใช้ร่วมกัน)
  functions/       # edge functions ทั้งหมด: sheets-sync, admin-users, domain-auth, send-push (canonical ที่นี่ตั้งแต่ 2026-09-09)
e2e/               # Playwright specs
scripts/           # สคริปต์นำเข้าข้อมูล (Price List/โปร) + สร้างไอคอน
docs/              # เอกสารสถาปัตยกรรม / การ deploy
```

## ฐานข้อมูลและ backend

- **Schema = ไฟล์ migration เท่านั้น** — ชุด canonical `0001..N` ของ DB ที่ใช้ร่วมกันอยู่ที่ repo นี้ (`supabase/migrations/` — กลับมาจาก repo Influ เมื่อ 2026-09-09 ตามโมเดล 2 ระบบ): schema เปลี่ยนเพื่อฟีเจอร์ของแอปไหนก็เขียนไฟล์ที่นี่ แล้วแก้ `src/lib/database.types.ts` ของทั้ง 2 repo ให้ตรง ห้ามแก้ DB ด้วยมือ (ดู [supabase/README.md](supabase/README.md))
- **Edge functions** (mirror ที่ `supabase/functions/` ของ repo นี้ทั้งหมด — deploy ผ่าน MCP/CLI ไม่ auto จาก git): `sheets-sync` (ดึงยอดขายจาก Google Sheets รายวัน), `admin-users` (จัดการบัญชี/สิทธิ์ของทุกแอป), `domain-auth` (เช็คอีเมลตอนล็อกอิน — ใช้ทั้ง 2 แอป), `send-push` (Web Push ของทั้ง 2 แอป)
- **Secrets ไม่อยู่ใน repo** — เก็บใน Supabase Vault (คีย์ Google service account, VAPID, secret ของ function, `influ_app_url`) และ env ของ edge function; รายการครบอยู่ใน [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Storage**: bucket `documents` — ไฟล์ของ Task (`tasks/`), Wellness (`wellness/`), My List (`my-tasks/`), รูปโปรไฟล์ (`avatars/`); ของระบบ Influencer (`influencers/`, `influ-profiles/`, `doctors/`, `templates/`) อยู่ bucket เดียวกัน
- **RLS**: ตารางส่วนใหญ่เป็น "ผู้ใช้ที่ล็อกอินเข้าถึงได้ทั้งหมด" โดยตั้งใจ (ระบบภายในแผนก) — สิทธิ์การมองเห็น/แก้ไขคุมที่ชั้นแอปผ่าน `permissions` ยกเว้นตารางส่วนตัว (`list_*`, `push_subscriptions`, `influ_notifications`) และถังขยะ/RPC ของ Influ ที่มี guard ใน DB
- DB เดียวกันมีผู้ใช้อีก 2 แอป: ระบบ Influencer (`influ_*`, `influencers`, `doctors`) และ Sales Assistant (`sa_*`, โปรแกรม offline บน iPad) — **ห้ามลบ/แก้ตารางของแอปอื่น** (ตาราง `sq_*` ของ Sales Queue เป็นของแอปนี้แล้ว); FK ข้ามระบบกับ Influ มี 4 เส้น (`tasks.influencer_id/doctor_id` → Influ, `influ_procedure_items.price_item_id/promo_package_id` → `price_items`/`promo_packages` ที่นี่ — **ห้ามลบ 2 ตารางนี้**)

## การเข้าระบบและสิทธิ์

- **สมัครเองไม่ได้** — บัญชีถูกสร้างจากหน้า `/accounts` โดยผู้ดูแล หรืออีเมลโดเมนบริษัทล็อกอินผ่าน Google แล้วรออนุมัติสิทธิ์ (trigger `handle_new_user` + ตาราง `allowed_emails` / `allowed_email_domains`)
- สิทธิ์เป็นสวิตช์อิสระต่อบัญชีใน `profiles.permissions` (`data`, `team`, `pricing`, `sales_queue`, `doctor_manage`, ระดับ Influencer 3 ระดับ `influ_view`/`influ_hunter`/`influ` — ใช้ในแอป Influ, Wellness 4 บทบาท) + `profiles.role = 'admin'` สำหรับจัดการบัญชี — นิยามที่ `src/lib/permissions.ts` ทุกหน้า server-guard ด้วย `getAccess()` + `hasPermission()`; **บัญชี/สิทธิ์ของแอป Influ ก็ตั้งจากหน้า `/accounts` ที่นี่** (Supabase ตัวเดียวกัน)
- หน้าแรกหลังล็อกอิน (`/start`) ส่งไปยังระบบตามสิทธิ์ที่มี — ระดับ influ* ถูกส่งออกไปแอป Influ (คุกกี้แยกตามโดเมน ต้องล็อกอินที่นั่นอีกรอบจนกว่าจะอยู่ใต้โดเมนเดียวกัน)

## Deploy / ย้ายไป server ของบริษัท

ตอนนี้ push `main` = Vercel deploy อัตโนมัติ (CI ต้อง build + lint ผ่านก่อน) ขั้นตอน self-host และของที่ต้องเตรียมอยู่ใน [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — ระบบ Influencer มีเอกสารส่งมอบของตัวเองที่ repo นั้น (`docs/INTEGRATIONS.md` จุดผูก API, `docs/DEPLOYMENT.md`)

## เอกสาร

| ไฟล์ | สำหรับ |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | ภาพรวมสถาปัตยกรรม, โมดูล, ตารางใครเป็นเจ้าของ, flow ของ request |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | topology ปัจจุบัน (2 แอป 1 Supabase), env/secrets, ขั้นตอน self-host, checklist หลังย้าย |
| [supabase/README.md](supabase/README.md) | migrations อยู่ที่ไหน + edge functions ตัวไหนอยู่ repo ไหน |
| [src/influ-bridge/README.md](src/influ-bridge/README.md) | สิ่งที่ Team ยังแตะข้อมูลของระบบ Influencer |
| `the-art-influencer/docs/INTEGRATIONS.md` | **จุดผูก API ของระบบ Influencer** (E-document, ลงคิว, ทะเบียนหมอ, SSO) — สำหรับทีม IT (อยู่ repo นั้น) |
| [AGENTS.md](AGENTS.md) | บันทึกการทำงานสะสมของ AI agent ที่พัฒนาระบบ (ละเอียดมาก ตามลำดับ migration) — ใช้เป็น **ประวัติการตัดสินใจ** ไม่ใช่สเปก |
