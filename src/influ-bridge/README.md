# `src/influ-bridge/` — สะพานไปข้อมูลของระบบ Influencer (สำเนาฝั่ง Team)

ระบบ Influencer แยกเป็น repo ของตัวเองเมื่อ 2026-09-08 (`MediaforgeThailand/the-art-influencer`) แต่ยังใช้ **Supabase ตัวเดียวกัน** — ทีมคอนเทนต์ยังต้องติดแท็ก influencer/หมอ/ทีม product ลงงานใน `/tasks`, ดูแฮชแท็กบังคับของเคส และแก้ทะเบียนหมอจาก `/tag-management` โฟลเดอร์นี้คือโค้ดชุดเล็กที่ทำเรื่องนั้นโดย**อ่าน/เขียนตารางของระบบ Influencer ตรง**ผ่าน supabase-js

| ไฟล์ | ทำอะไร | ตารางที่แตะ |
|---|---|---|
| `constants.ts` | ทีม product 9 ทีม (`INFLU_PRODUCT_TEAMS`), ชื่อ influ บรรทัดเดียว (`influLabel`), ชุดแฮชแท็กบังคับ (`influTagHashtags` → `hashtagText`/`missingHashtagCount`), ชื่อที่แสดงของหมอ (`doctorDisplayName`, `DOCTOR_TITLES`) — คัดมาจาก `influ-constants.ts` ของ repo Influ | — |
| `influ-tags.ts` (server) | ตัวเลือกแท็ก influencer = เคสที่ยังเดินงานอยู่ (`archived=false`, ไม่ปิดงาน, ไม่ปฏิเสธ) พร้อมเลขใบ ปว./แท็กแคมเปญ/ทีม/รหัสโปร | อ่าน `influencers`, `influ_procedure_items` (+`promo_packages.sku`), `doctors`, `influ_campaign_defs` |
| `doctor-select.tsx` | `DoctorSelect` (dropdown) + `DoctorAvatar` + `DoctorNameChip` | อ่าน `doctors` (ผ่าน props) |
| `doctor-manager.tsx` | `DoctorManagerPanel` — ทะเบียนหมอเต็มชุด (เพิ่ม/แก้ชื่อ/เลขใบ ปว./ทีม/รูป/ซ่อน/ลบ) ฝังใน `/tag-management` — **เปลี่ยนชื่อ = ตามแก้ `influencers.doctor_name` + `influ_calendar_events.doctor_name` ที่สะกดตรงกับชื่อเดิม และ merge เมื่อชื่อชน** (กติกาเดียวกับหน้า `/influ-doctors` ของแอป Influ) | อ่าน/เขียน `doctors`, อัปเดต `influencers`/`influ_calendar_events`, storage `doctors/{id}/`, เขียน `influ_activity_log` |
| `influ-log.ts` | `logInflu()` fire-and-forget (มี `.then()` ปิดท้าย) | เขียน `influ_activity_log` |
| `hashtag-chips.tsx`, `influ-tag-avatar.tsx` | ชิปแฮชแท็ก + ปุ่มคัดลอก, รูปโปรไฟล์ influ (signed URL ผ่าน `useSignedUrl`) | — |

ผู้ใช้โฟลเดอร์นี้ (ทั้งหมด): `src/app/(app)/tasks/{page.tsx, task-panel.tsx, tag-required-modal.tsx}` และ `src/app/(app)/tag-management/{page.tsx, tag-management-client.tsx}`

## กติกา

1. **ต้นฉบับอยู่ repo Influ** — กติกาแฮชแท็ก (`hashtagSafe` ตัด `-` เพราะ IG/FB ตัดแท็กที่ขีด, ลำดับ #Influ·#DR·#แคมเปญ·#หัตถการ·#โปร), ทีม product (key = แท็กตัวพิมพ์เล็ก เพิ่มทีม = migration ผ่อน check constraint + `InfluProductTeam` ใน `database.types.ts` ทั้ง 2 repo), รูปแบบชื่อหมอ (`นพ. ชื่อ นามสกุล (ชื่อเล่น)` = กุญแจจับคู่ `doctors.name` ↔ `*.doctor_name`) **เปลี่ยนที่นั่นต้องมาแก้ที่นี่ให้ตรง**
2. ไม่มีใครใน repo นี้ควร import จากโฟลเดอร์นี้เพิ่ม นอกจาก 5 ไฟล์ข้างบน — ถ้าหน้าใหม่ของ Team ต้องการข้อมูล Influ ให้เพิ่มที่นี่พร้อมบันทึกใน README ว่าแตะตารางอะไร
3. **วันที่ Supabase ของระบบ Influencer แยกออกไป** (ดู `docs/DEPLOYMENT.md` ของ repo Influ §4.0) โฟลเดอร์นี้คือจุดเดียวที่ต้องเปลี่ยนจาก query ตรงเป็น API client และ FK `tasks.influencer_id`/`tasks.doctor_id` ต้องถูกตัด
