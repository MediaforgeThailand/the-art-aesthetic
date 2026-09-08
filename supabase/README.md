# `supabase/` — ของที่ยังอยู่ใน repo นี้

Supabase โปรเจกต์ `TheArtAesthetic` (`zcoqzasbtgfccuibteji`) ถูกใช้โดย 4 แอป: แอปนี้ (Team/Wellness), ระบบ Influencer (`the-art-influencer`), Sales Assistant (`sa_*`), Sales Queue (`sq_*`)

## migrations — ย้ายไป repo `the-art-influencer` แล้ว (2026-09-08)

**ชุด canonical `0001..N` ของ DB ที่ใช้ร่วมกันอยู่ที่ `the-art-influencer/supabase/migrations/`** (ชุดเดียวครอบทั้งตาราง Team และ Influ เพราะเป็น DB เดียว) — schema เปลี่ยนเพื่อฟีเจอร์ของแอปนี้ก็ต้องเขียนไฟล์ที่นั่น (`../the-art-influencer/supabase/migrations/<เลขถัดไป>_<ชื่อ>.sql`) → apply บน Supabase (CLI/MCP) → แก้ `src/lib/database.types.ts` ของ**ทั้ง 2 repo** (ไฟล์เขียนมือ) กติกาเต็มอยู่ใน README ของโฟลเดอร์นั้น; ห้ามแก้ DB ด้วยมือโดยไม่มีไฟล์

ถ้าวันหนึ่ง Supabase ของระบบ Influencer แยกออกไป ให้เอา `pg_dump --schema-only` ของโปรเจกต์นี้มาเป็น baseline ใหม่ที่นี่

## functions/

| function | อยู่ที่ | หมายเหตุ |
|---|---|---|
| `sheets-sync` | **repo นี้** | ดึงยอดขายจาก Google Sheets ของทีม DA รายวัน (pg_cron 00:30 UTC) — ของ Team ล้วน |
| `admin-users`, `domain-auth`, `send-push` | repo `the-art-influencer` | backend ร่วมของทั้ง 2 แอป (จัดการบัญชี / เช็คอีเมลตอนล็อกอิน / Web Push) — หน้า `/accounts` และ `/login` ของแอปนี้ยังเรียกใช้เหมือนเดิม แต่โค้ด mirror อยู่ที่นั่น (`send-push` ต่อ URL เต็มของแอป Influ จาก Vault `influ_app_url`) |

deploy: `supabase functions deploy <name>` (หรือ Supabase MCP) — ไม่ auto จาก git

`seed.sql` = ข้อมูล demo ตั้งต้น (ไม่ได้ใช้แล้วบนโปรดักชัน)
