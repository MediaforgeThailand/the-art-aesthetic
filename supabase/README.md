# `supabase/` — ฐานข้อมูลของระบบ Aesthetics (canonical อยู่ที่ repo นี้)

Supabase โปรเจกต์ `TheArtAesthetic` (`zcoqzasbtgfccuibteji`, ap-southeast-2) เป็น **ฐานข้อมูลของฝั่ง Aesthetics** — แอปนี้ (Team/Wellness/Pricing/Price List/แดชบอร์ด/บัญชี), Sales Assistant (`sa_*`) และ Sales Queue (`sq_*`) ใช้ร่วมกัน ส่วน **ระบบ Influencer (repo `the-art-influencer`) เป็นแขกที่ใช้ DB นี้ชั่วคราว** จนกว่าจะแยก Supabase ของตัวเอง (ดู "ตอนแยก" ด้านล่าง)

> โมเดล 2 ระบบ (ผู้ใช้ 2026-09-09): Aesthetics = ทุกอย่างที่ไม่ใช่ Influ อยู่ที่เดียวกัน ⇒ schema/edge function ที่เป็นของ DB นี้อยู่ที่ repo นี้ ไม่ใช่ repo Influ (ย้ายกลับมาเมื่อ 2026-09-09 — ก่อนหน้านั้นเคยย้ายไป repo Influ ตอนแยก repo วันที่ 08)

## migrations/ — ชุด canonical `0001..N` ของทั้ง DB

- ลำดับเดียวของทั้ง DB มีทั้งตารางของ Aesthetics (tasks, wellness_*, price_*, promo_*, sales_*, list_*, sa_*, sq_*) และของ Influencer (influencers, influ_*, doctors) เพราะเป็น DB เดียว — จะแยกไม่ได้จนกว่าจะแยก Supabase
- **schema เปลี่ยนที่แอปไหนก็ตาม (รวมฟีเจอร์ของ Influ) ให้เขียนไฟล์ migration ที่นี่** (เลขถัดไป + ชื่อสั้นๆ) → apply บน Supabase (CLI/MCP) → แก้ `src/lib/database.types.ts` ของ **ทั้ง repo นี้และ repo Influ** ให้ตรง (ไฟล์เขียนมือ ไม่ได้ generate) — repo Influ ไม่มีโฟลเดอร์ migrations แล้ว มีแต่ README ชี้มาที่นี่
- ห้ามแก้ไฟล์ migration เก่า; เปลี่ยนความหมายของคอลัมน์เดิมต้องเขียน `UPDATE` ย้ายข้อมูลเก่าในไฟล์เดียวกัน (บทเรียน 0104 ของระบบ Influ)
- **trigger function ที่เป็น `security definer` ต้อง `revoke execute ... from public, anon, authenticated`** ในไฟล์เดียวกัน; RPC ใหม่ต้อง `grant execute ... to authenticated` เอง (default privileges ถูกตั้งเป็น revoke ตั้งแต่ 0107); policy ใหม่ใช้ `(select auth.uid())` (0115)
- ชุดนี้ต้อง **replay ได้บน Supabase stack เปล่า** (ไม่ใช่ Postgres เปล่า — `0001` ใช้ schema `storage`, `0038` ใช้ `vault`) ทดสอบล่าสุด 2026-08-03
- ข้อมูลที่ถูกแก้ตรงบน remote โดยไม่มีไฟล์ (data cleanup ไม่ใช่ schema) ถูกบันทึกไว้ใน `AGENTS.md` ของ repo ที่เกี่ยวข้อง — เช่น เก็บกวาดชื่อหมอ 2026-08-03, ล้าง `docs_sent_at` 2026-09-03 (repo Influ)
- ตาราง `sa_*` (Sales Assistant) และ `sq_*` (Sales Queue) มีไฟล์ migration อยู่ในชุดนี้ด้วย — ห้ามลบ/แก้โดยไม่คุยกับแอปนั้น

## functions/ — edge functions ทั้งหมดอยู่ที่นี่

| function | verify_jwt | ใครเรียก | หมายเหตุ |
|---|---|---|---|
| `admin-users` | เปิด | หน้า `/accounts` ของแอปนี้ | สร้าง/ลบบัญชี ตั้งสิทธิ์ (service role) · เพิ่มสิทธิ์ใหม่ (รวมสิทธิ์ `influ*`) ต้องแก้ `VALID_PERMISSIONS` ในนี้แล้ว redeploy |
| `domain-auth` | ปิด | หน้า `/login` ของทั้ง 2 แอป (ก่อนมี session) | เช็คว่าอีเมลมีบัญชีแล้ว / อยู่ใน allowlist / เป็นโดเมนบริษัทที่ต้องใช้ Google |
| `send-push` | ปิด (header `x-push-secret`) | trigger ใน DB ตอน insert `notifications` (Team) และ `influ_notifications` (`body.source='influ'`) | Web Push ของทั้ง 2 แอป — URL ของแจ้งเตือน Influ ถูกทำเป็น URL เต็มด้วย Vault secret `influ_app_url` เพราะอุปกรณ์อาจสมัคร push จากโดเมนของแอปหลัก · **ข้อความแจ้งเตือนของ Influ ถูกเขียนซ้ำใน `influ-notification-bell.tsx` ของ repo Influ — แก้ที่หนึ่งต้องแก้อีกที่** |
| `sheets-sync` | ปิด (header `x-sync-secret`) | pg_cron 00:30 UTC | ดึงยอดขายจาก Google Sheets ของทีม DA รายวัน — ของ Team ล้วน |

deploy: `supabase functions deploy <name>` (หรือ Supabase MCP) — ไม่ auto จาก git

`seed.sql` = ข้อมูล demo ตั้งต้น (ไม่ได้ใช้แล้วบนโปรดักชัน)

## ตอนแยก Supabase ของระบบ Influencer (งานของทีม IT — ยังไม่ทำ)

1. ตัด FK ข้ามระบบ 4 เส้น (`tasks.influencer_id`, `tasks.doctor_id`, `influ_procedure_items.price_item_id`, `influ_procedure_items.promo_package_id`) และเปลี่ยน `src/influ-bridge/` ของแอปนี้ให้เรียก API ของ Influ แทนการอ่านตารางตรง
2. `pg_dump --schema-only` เฉพาะตาราง `influencers`, `influ_*`, `doctors` (+ RPC/trigger ของมัน เช่น `influ_memo_transition`) ไปเป็น `0001` ของ repo Influ แล้วย้ายข้อมูล
3. ชุดนี้ (repo นี้) ยังเป็น canonical ของ DB Aesthetics ต่อไป — ไฟล์ migration เก่าของ Influ ในชุดนี้คงไว้เป็นประวัติ (ห้ามลบ ไม่งั้น replay ไม่ผ่าน)
