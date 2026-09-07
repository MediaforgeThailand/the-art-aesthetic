# จุดผูก API ของระบบ Influencer กับระบบอื่นของบริษัท

> สำหรับทีม IT — อัปเดต 2026-09-08. ระบบ Influencer ยังทำงาน "ครบวงจรในตัวเอง" ได้อยู่แล้ว (ขั้นที่ต้องคุยกับระบบอื่นตอนนี้ทำโดยคนคัดลอกข้อมูลไปกรอกเอง) เอกสารนี้ชี้ว่า **ตรงไหนของ flow ที่ควรแทนด้วย API** ข้อมูลที่ระบบมีให้อยู่แล้ว และโค้ดที่ต้องแก้

## 0. ภาพรวม flow ของเคส Influencer

```
Hunting (ล่ารายชื่อ)  →  โปรไฟล์ (ตัวบุคคล)  →  เปิดเคส (1 รอบ = 1 แถว influencers)
                                                    │
   Stage 1  Memo ขออนุมัติ  ── 1.0 ยื่นเรื่อง → 1.1 ทำเอกสาร Memo → 1.2 อัพไฟล์ที่อนุมัติ   ◄── [A] E-document
                                                    │
   Stage 2  สัญญา + วันรับบริการ ── อัพไฟล์สัญญา → ลงคิวเข้าปฏิทิน → ทำหัตถการ           ◄── [B] ระบบลงคิว / HIS
                                                    │
   Follow Up  ตั้งเป้าโพส → แปะลิงก์โพส (แฮชแท็กบังคับ) → ปิดงาน                        ◄── [C] Meta (IG/FB) tracking
```

ตารางหลัก: `influencers` (เคส), `influ_profiles` (ตัวบุคคล), `influ_procedure_items` (หัตถการ + ต้นทุน), `influ_calendar_events` (คิว), `doctors` (ทะเบียนแพทย์), `influ_assignees` (ผู้รับผิดชอบ), `influ_activity_log` (log ทุก mutation)

## A. E-document — Memo ขออนุมัติเคส (จุดที่ต้องผูกก่อนส่งมอบ)

### ตอนนี้ทำอย่างไร

| ขั้น | ใครทำ | ในระบบเกิดอะไร | คอลัมน์ใน `influencers` |
|---|---|---|---|
| 1.0 ยื่นเรื่อง | ผู้ดูแลเคส | กดยืนยันว่าส่งเรื่องขอ Memo | `docs_sent_at` |
| 1.1 ทำเอกสาร | "ผู้ออก Memo" (บทบาทใน `influ_assignees.scopes = memo`) | **กดปุ่มคัดลอกข้อความ** ที่ระบบประกอบให้ แล้วไปสร้างเอกสารในระบบ E-document เอง จากนั้นกลับมาติ๊กว่าส่งแล้ว | `memo_submitted_at` |
| 1.2 อนุมัติ | ผู้ออก Memo | อัพโหลดไฟล์ Memo ที่อนุมัติแล้ว (PDF/รูป) เข้า Storage → ระบบเลื่อนเคสไป Stage 2 อัตโนมัติ | `memo_file_path`, `memo_file_name`, `memo_uploaded_at`, `stage = 2` |

โค้ด: `src/app/(influ)/influencers/[id]/docs-stages.tsx` → `MemoCopyStage` (ข้อความ Memo ประกอบที่ตัวแปร `detailText`, ฟังก์ชัน `uploadMemo` คือจุดที่เลื่อน stage), ค่าคงที่หัวเอกสาร/ผู้เซน/เพดานงบ ใน `src/influ/lib/influ-constants.ts` (`MEMO_COMPANY`, `MEMO_SIGNERS`, `INFLU_BUDGET_CAPS`, `memoStepOf()`)

### ข้อมูลที่ระบบมีให้สำหรับสร้างเอกสาร (payload)

| ฟิลด์ในเอกสาร | มาจาก |
|---|---|
| ชื่อ-นามสกุล (ชื่อเล่น) | `influencers.first_name/last_name/nickname` (sync จาก `influ_profiles`) |
| อาชีพ · ยอดผู้ติดตาม · Tier | `occupation`, `followers` / `follower_note`, `tier` (nano/micro/mid/macro/celebrity — ช่วงและเพดานงบใน `INFLU_TIERS`/`INFLU_BUDGET_CAPS`) |
| โปรแกรมที่ทำ (+ ราคาต่อรายการ, รายการที่แบรนด์ support) | `influ_procedure_items` (`name`, `price`, `is_supported`, `product_team`) — `procedure_text` เป็นข้อความสรุปที่ sync ไว้ |
| วงเงินที่ขออนุมัติ | `voucher_count × voucher_unit` (snapshot ตอนเปิดเคส) |
| ค่าตัว · มูลค่ารวม | `talent_fee`, `case_value` (= voucher + ค่าตัว) |
| หมายเหตุงบเกินเพดาน Tier | `budget_note` (บังคับกรอกเมื่อเกิน `INFLU_BUDGET_CAPS`) |
| วันที่ทำหัตถการ · แพทย์ | `service_date`, `doctor_name` (→ `doctors.license_no`) |
| ผู้ออก Memo / ผู้อนุมัติ | `influ_assignees` (scope `memo`) + preset `MEMO_SIGNERS` |
| รหัส Influ / แคมเปญ | `influ_code` (เช่น `INF-00160`), `campaign_id` → `influ_campaign_defs.tag` |
| หน่วยงาน | `COMPANY_INFO` (`src/lib/constants.ts`) + `MEMO_COMPANY.to/purpose` |

### ที่อยากได้จาก API ของ E-document

1. **สร้างเอกสารจาก payload** (แทนการคัดลอกข้อความ) — ระบบยิงตอนผู้ออก Memo กดในขั้น 1.1 แล้วเก็บ `external_document_id` ไว้ที่เคส (ต้องเพิ่มคอลัมน์ผ่าน migration)
2. **รู้สถานะการอนุมัติ** — webhook/callback หรือ endpoint ให้ poll: อนุมัติแล้ว → ระบบตั้ง `memo_submitted_at`/`memo_file_path` (ดึงไฟล์ PDF มาเก็บใน Storage `influencers/{id}/memo/` เหมือนที่คนอัพเอง) แล้วเลื่อน stage ผ่านทางเดียวกับ `uploadMemo`
3. ถ้าระบบ E-document ต้องรู้จัก "ผู้ขอ/ผู้อนุมัติ" ด้วยรหัสพนักงาน → ต้องมีการ map `profiles.id` ↔ รหัสพนักงาน (ยังไม่มีคอลัมน์นี้ เพิ่มได้ใน `profiles`)

## B. ระบบลงคิว / HIS — วันรับบริการ

### ตอนนี้ทำอย่างไร

คิวหมอลง **2 ฝั่งแยกกัน**: เจ้าหน้าที่ลงคิวในระบบโรงพยาบาลก่อน (ยืนยันว่า influ มาจริง) แล้วทีม Influ ค่อยมาลงคิวในปฏิทินของระบบนี้ — โค้ด `ServiceBookingCard` ใน `src/app/(influ)/influencers/[id]/detail-client.tsx`: insert `influ_calendar_events` (`kind='service'`, `event_date`, `start_time` null = ทั้งวัน, `doctor_name`, `title` = ชื่อหัตถการ) + sync `influencers.service_date/doctor_name`; ปฏิทิน `/influ-calendar` และป้ายเตือน "รอลงคิวหมอ" อ่านจากตารางนี้ (`needsDoctorBooking()` ใน influ-constants)

### ข้อมูลที่ระบบมีให้

ตัวบุคคล (`influ_profiles`: ชื่อ, เบอร์ — **ยังไม่มีเลขบัตรประชาชน** ทิศทางที่วางไว้คือใช้เลขบัตรเป็นกุญแจหลังบ้านในอนาคต), วัน/เวลา, แพทย์ (`doctors.license_no`), รายการหัตถการ (`influ_procedure_items` + `price_items`/`promo_packages.sku`)

### ที่อยากได้จาก API ลงคิว

- สร้าง/ยืนยันนัดจากระบบนี้ แล้วเก็บ `external_appointment_id` ที่ `influ_calendar_events` **หรือ** รับ webhook เมื่อ HIS ลงคิวให้ influ คนนี้ → ระบบสร้างแถว `kind='service'` ให้เอง (ป้าย "รอลงคิวหมอ" จะดับเอง)
- ถ้ามี HN ของโรงพยาบาล ให้เก็บที่ `influ_profiles` (คอลัมน์ใหม่) เพื่อจับคู่ครั้งเดียว

## C. ทะเบียนแพทย์

`doctors` (`name` = ชื่อที่แสดง, `title/first_name/last_name/nickname`, `license_no` = เลขใบ ปว. **ใช้เป็นแฮชแท็ก `#DR<เลข>`**, `teams[]` = ทีม product ที่รับเคส, `photo_path`, `active`) — ตอนนี้กรอกมือที่ `/influ-doctors` (และ `/tag-management` ของทีมคอนเทนต์) ถ้า HIS มีทะเบียนแพทย์อยู่แล้ว sync เข้ามาได้ (จับคู่ด้วย `license_no`)

## D. Meta (Instagram/Facebook) — ติดตามยอดโพส

ทุกโพสของ influ ต้องติดแฮชแท็กชุดบังคับที่ระบบออกให้ (`caseHashtags()` ใน influ-constants): `#INF00160` (รหัส Influ — ตัด `-` ออกเพราะ IG/FB ตัดแฮชแท็กที่ขีด) · `#DR<เลขใบ ปว.>` · `#<แคมเปญ>` · `#<ทีม product>` · `#<รหัสโปร>` — ปลายทางคือดึงข้อมูลจาก Meta API มา attribute ยอดต่อคน/แคมเปญ (ยังไม่ได้ทำ) ลิงก์โพสที่ทีมแปะไว้อยู่ `influ_post_links` (`platform`, `url`, `kind` post/comment)

## E. ตัวตนผู้ใช้ / SSO

Supabase Auth (อีเมล+รหัสผ่าน และ Google) บัญชีต้องอยู่ใน `allowed_emails` หรือเป็นอีเมลโดเมนบริษัทที่ล็อกอินผ่าน Google — ถ้าบริษัทต้องการผูก AD/LDAP: Supabase รองรับ SAML SSO (แผน Pro / self-host ตั้งค่าได้) หรือ OIDC provider เพิ่ม โดยกติกาสิทธิ์ในแอป (`profiles.permissions`) ไม่ต้องเปลี่ยน

## F. อื่นๆ ที่มีอยู่แล้ว

| เรื่อง | สถานะ | โค้ด |
|---|---|---|
| ยอดขายจาก Google Sheets ของทีม DA | ทำงานอยู่ (pg_cron → edge `sheets-sync`) ต้องออก internet + service account key ใน Vault — ปิดได้ถ้า air-gapped | `supabase/functions/sheets-sync` |
| Web Push แจ้งเตือน | ทำงานอยู่ (trigger → edge `send-push` → push service ของเบราว์เซอร์) ต้องออก internet ไป FCM/APNs | `supabase/functions/send-push`, `src/lib/push.ts` |
| Price List / โปรจาก POS | นำเข้าจากไฟล์ export ด้วยสคริปต์ (`scripts/import-promo-packages.mjs`) — ถ้า POS มี API ให้ sync ตรงได้ | `promo_packages` |
| แอป Sales Assistant / Sales Queue | repo แยก — Sales Assistant ใช้ DB เดียวกัน (ตาราง `sa_*` + อ่าน `price_items`); ลิงก์กลับกันด้วย URL ใน `src/lib/constants.ts` (`SALES_ASSISTANT_URL`, `SALES_OPERATION_URL`) | |

## G. แนวทางที่แนะนำเวลาผูก API จริง

1. **เรียก API ภายนอกจากฝั่ง server เท่านั้น** — Next route handler ใต้ `src/app/api/influ/…` (มี session ของผู้ใช้ให้เช็คสิทธิ์) หรือ Supabase edge function (เรียกจาก DB trigger ได้) — ห้ามให้เบราว์เซอร์ถือ credential ของระบบอื่น
2. **secret ผ่าน env / Vault** ตามแบบที่ `send-push`/`sheets-sync` ทำ (`get_app_secret()` อ่านได้เฉพาะ service role) — ไม่มีคีย์ในโค้ด
3. **เก็บ id ฝั่งนอกไว้ในตารางเรา** (`external_document_id`, `external_appointment_id`) + idempotency key = `influencers.id` + `round_no` กันยิงซ้ำ
4. **webhook ต้องมี shared secret** ในหัว request (แบบ `x-push-secret`) และเขียน `influ_activity_log` ทุกครั้งที่ระบบนอกเปลี่ยนสถานะเคส (actor = ชื่อระบบ)
5. ถ้าระบบนอกล่ม ต้องไม่ล็อกงานคน — ทางอัพไฟล์เอง (1.2) และลงคิวเองในปฏิทินยังต้องใช้ได้เป็น fallback
6. ทุกการเปลี่ยน schema ที่ต้องเพิ่ม = ไฟล์ migration ใหม่ใน `supabase/migrations/` + แก้ `src/lib/database.types.ts`

## H. สิ่งที่ต้องได้จากฝั่ง IT ก่อนเริ่มเขียนโค้ดผูก

- สเปก API ของ E-document และระบบลงคิว (endpoint, รูปแบบ auth, ตัวอย่าง payload/response, มี webhook ไหม, rate limit)
- environment สำหรับทดสอบ (sandbox) + บัญชีทดสอบ
- ใครเป็นเจ้าของ template เอกสาร Memo ใน E-document (ฟิลด์ที่ต้องส่งครบชุด)
- วิธีระบุตัวบุคคล/แพทย์/พนักงาน ที่ระบบนอกใช้ (HN, เลขบัตร, รหัสพนักงาน, เลขใบ ปว.) เพื่อวางคอลัมน์ map ให้ถูกตั้งแต่แรก
