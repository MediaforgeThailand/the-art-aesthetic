-- กลุ่มหัตถการของ Price List: ฉีด / ทรีตเม้น / เครื่อง (ติดได้มากกว่า 1 กลุ่มต่อรายการ)
-- หน้า /price-list แบ่งแท็บตามกลุ่มนี้ — รายการที่ติดหลายกลุ่มจะโผล่ในทุกแท็บที่ติดไว้
-- ค่าเริ่มต้นด้านล่างมาจากการอ่านว่าแต่ละโปร "ประกอบด้วยหัตถการอะไรบ้าง" (แพ็กเกจรวมมักได้ทั้งเครื่องและฉีด)
-- แก้ไขภายหลังได้ที่หน้า /pricing — ไม่ต้องแก้ไฟล์นี้

alter table price_items
  add column if not exists groups text[] not null default '{}'::text[];

comment on column price_items.groups is
  'กลุ่มหัตถการ: injection=ฉีด, treatment=ทรีตเม้น, device=เครื่อง — ต้องมีอย่างน้อย 1 ค่า';

-- backfill: เฉพาะแถวที่ยังไม่มีกลุ่ม — รันซ้ำจะไม่ทับ tag ที่ทีมแก้เองในหลังบ้าน
update price_items set groups = case
  -- Pico Smooth + Celebrit Glow + Princess White
  when category like 'โปรแกรม Facial Treatment%' and name like 'โปรแกรมผิวดารา%'
    then array['device','injection']::text[]
  -- 6 STEP + liftera Pen 500 Shot
  when category like 'โปรแกรม Facial Treatment%' and name like 'โปรแกรม Firming Skin%'
    then array['treatment','device']::text[]
  -- Q-switch + มาส์กทองคำ + ฉายแสง
  when category like 'โปรแกรม Facial Treatment%' and name like 'โปรแกรม Duo Face Bright%'
    then array['treatment','device']::text[]
  -- Clear ACNE / Vita Plus / Booster = ทรีตเม้นล้วน
  when category like 'โปรแกรม Facial Treatment%' and name like 'โปรแกรม %'
    then array['treatment']::text[]
  -- ฟิลเลอร์สะโพก
  when category like 'โปรแกรม Facial Treatment%' and name like 'โปรฟิลเลอร์%'
    then array['injection']::text[]
  -- สกินบูสเตอร์ฉีด
  when category like 'โปรแกรม Facial Treatment%' and name like 'Dewy Skin Plus%'
    then array['injection']::text[]
  -- บริการเสริม
  when category like 'โปรแกรม Facial Treatment%' and name like 'ค่าบริการสระผม%'
    then array['treatment']::text[]
  -- ยาระงับความรู้สึกทางหลอดเลือด
  when category like 'โปรแกรม Facial Treatment%' and name like 'Sedate%'
    then array['injection']::text[]
  -- ของแถม Pico
  when category like 'โปรแกรม Facial Treatment%' and name like 'Pico smooth%'
    then array['device']::text[]
  -- ของแถม Q-Switch
  when category like 'โปรแกรม Facial Treatment%' and name like 'Q-Switch%'
    then array['device']::text[]
  -- ของแถมกำจัดขน
  when category like 'โปรแกรม Facial Treatment%' and name like 'Diode laser%'
    then array['device']::text[]
  -- เมโสสะกิด transamin
  when category like 'โปรแกรม Facial Treatment%' and name like 'White Label Program%'
    then array['injection']::text[]
  -- ฉีดสลายฟิลเลอร์
  when category like 'โปรแกรม Facial Treatment%' and name like '[ของแถม ฉีดสลายฟิลเลอร์]%'
    then array['injection']::text[]
  -- Botox + Liftera/Doublo + Q-switch
  when category like 'โปรแกรม Facial Treatment%' and name like 'โปรหน้า V Glow Up%'
    then array['injection','device']::text[]
  -- Filler + Botox (+Fat)
  when category like 'โปรแกรม Facial Treatment%' and name like 'Set สุดคุ้ม%'
    then array['injection']::text[]
  -- Fat Laura / Botox
  when category like 'โปรแกรม Facial Treatment%' and name like 'พิเศษ!! โปรแลกซื้อ%'
    then array['injection']::text[]
  -- Ultraformer III 400 Shots อย่างเดียว
  when category like 'โปรแกรม Facial Treatment%' and name like '%แพ็คเกจ S%'
    then array['device']::text[]
  -- M/L/XL = Ultraformer + Fat/Botox
  when category like 'โปรแกรม Facial Treatment%' and name like '%แพ็คเกจ %'
    then array['device','injection']::text[]
  -- Doublo + Fat/Botox
  when category like 'โปรแกรม Facial Treatment%' and name like '%Doublo%'
    then array['device','injection']::text[]
  -- Double L/XL (สะกดในไฟล์) = Doublo + Fat/Botox
  when category like 'โปรแกรม Facial Treatment%' and name like '%Double %'
    then array['device','injection']::text[]
  -- เครื่อง Venus Legacy
  when category like 'Venus Legacy%' and name like 'นวด RF%'
    then array['device']::text[]
  -- ทรีตเม้น 6 ขั้น + โหมด Phono/Cool ของเครื่อง
  when category like 'Venus Legacy%' and name like 'Glow Harmony%'
    then array['treatment','device']::text[]
  -- Therafill ฉีด
  when category like 'Venus Legacy%' and name like 'Pure Collagen%'
    then array['injection']::text[]
  -- เซตฉีดล้วน (Rejuran/Botox/Filler/Meso)
  when category like 'Venus Legacy%' and name like 'THE ART CELEBRITY COCKTAIL%'
    then array['injection']::text[]
  -- ทรีตเม้นหน้า
  when category like 'Venus Legacy%' and name like 'Gold Facial%'
    then array['treatment']::text[]
  -- Pro Firm/Clear/CALM/Fresh/Bright = ทรีตเม้นหน้า
  when category like 'Venus Legacy%' and name like 'Pro %'
    then array['treatment']::text[]
  -- Ulthera + แถม Botox
  when category like 'Ulthera%' and name like '%Botox%'
    then array['device','injection']::text[]
  -- Ulthera + แถม Fat Burn
  when category like 'Ulthera%' and name like '%Fat%'
    then array['device','injection']::text[]
  -- Ulthera / แพ็กเกจแถม Liftera-Doublo = เครื่องล้วน
  when category like 'Ulthera%'
    then array['device']::text[]
  -- ร้อยไหม = หัตถการเข็ม
  when category like 'จี้ไฝ & ร้อยไหม%' and name like 'ร้อยไหม%'
    then array['injection']::text[]
  -- หัวเมโสกัน
  when category like 'จี้ไฝ & ร้อยไหม%' and name like 'Meso Gun%'
    then array['injection']::text[]
  -- จี้ไฝ/จี้กระ = เครื่อง fractional CO2 laser (ตาม benefits)
  when category like 'จี้ไฝ & ร้อยไหม%'
    then array['device']::text[]
  -- ฉีดสิว
  when category like 'Acne Treatment%' and name like '%ฉีดสิว%'
    then array['injection']::text[]
  -- Acne Clear / กดสิว
  when category like 'Acne Treatment%'
    then array['treatment']::text[]
  -- เมโส = ฉีด
  when category like 'Treatment Face & Body%' and name like '%Meso%'
    then array['injection']::text[]
  -- ผลักวิตามิน / นวดหน้า / Glass Skin
  when category like 'Treatment Face & Body%'
    then array['treatment']::text[]
  -- นวดมือ + เครื่อง Therma Tite
  when category like 'Therma Tite%' and name like 'นวดมือ+%'
    then array['device','treatment']::text[]
  -- เครื่อง RF
  when category like 'Therma Tite%'
    then array['device']::text[]
  -- ให้วิตามินทางหลอดเลือด
  when category like 'IV Drip%'
    then array['injection']::text[]
  -- นวด
  when category like 'Breast Massage%'
    then array['treatment']::text[]
  -- เครื่อง RF จุดซ่อนเร้น
  when category like 'Therma V%'
    then array['device']::text[]
  -- ฉายแสง/มาส์ก = ทรีตเม้น
  when category like 'Medical Light & Mask%'
    then array['treatment']::text[]
  -- ฉีดคีลอยด์ / Subcision / สลายฟิลเลอร์
  when category like 'Keloid%'
    then array['injection']::text[]
  when category like 'Botox%'
    then array['injection']::text[]
  when category like 'Filler%'
    then array['injection']::text[]
  when category like 'Meso%'
    then array['injection']::text[]
  when category like 'Juvelook%'
    then array['injection']::text[]
  when category like 'Sculptra%'
    then array['injection']::text[]
  -- สเต็มเซลล์ ฉีดหน้า/IV (ตาม process)
  when category like 'Skin lab test%'
    then array['injection']::text[]
  -- ยาสลายไขมันฉีด
  when category like 'Fat Burn%'
    then array['injection']::text[]
  -- inskin/fraxel (เครื่อง) + PRP (ฉีด)
  when category like 'Diamond Baby Face%'
    then array['device','injection']::text[]
  when category like 'PRP%'
    then array['injection']::text[]
  -- รวม Doublo Mode1/Mode2/Needle RF/Pico
  when category like 'Doublo%'
    then array['device']::text[]
  when category like 'Ultraformer III & Hifu%'
    then array['device']::text[]
  when category like 'Diode laser%'
    then array['device']::text[]
  when category like 'Qswitch%'
    then array['device']::text[]
  -- รวม Enduremax shock wave
  when category like 'Fractional / Inskin / Enduremax%'
    then array['device']::text[]
  -- Pico/Q-Switch + Fresh zell/Princess white
  when category like 'โปรแกรม Celebrity Program%'
    then array['device','injection']::text[]
  -- Pico/Q-Switch + Pink Line
  when category like 'โปรแกรม Hydro radiance%'
    then array['device','injection']::text[]
  -- โปรแลกซื้อ Ulthera = ของฉีดทั้งหมด
  when category like '• สำหรับลูกค้าที่ซื้อ%'
    then array['injection']::text[]
  when category like 'Harmonyca%'
    then array['injection']::text[]
  when category like 'นวดมือ%'
    then array['treatment']::text[]
  -- Oligio + Ultraformer/Ulthera/Doublo
  when category like 'Oligio X%'
    then array['device']::text[]
  -- ออกซิเจนบำบัด
  when category like 'Hyperbaric Oxygen Therapy%'
    then array['treatment']::text[]
  -- รายการใหม่ที่ยังไม่เข้ากฎไหน — ตั้ง "ทรีตเม้น" ไว้ก่อนแล้วไปแก้ที่ /pricing
  else array['treatment']::text[]
end
where groups = '{}'::text[];

-- ทุกรายการต้องมีอย่างน้อย 1 กลุ่ม และเป็นค่าที่รู้จักเท่านั้น
alter table price_items
  drop constraint if exists price_items_groups_valid;
alter table price_items
  add constraint price_items_groups_valid check (
    -- cardinality ไม่ใช่ array_length: array_length(.,1) ของ array ว่างคืน NULL
    -- แล้ว CHECK ที่ได้ NULL จะ "ผ่าน" — รายการไม่มีกลุ่มจะหลุดเข้า DB ได้
    cardinality(groups) >= 1
    and groups <@ array['injection', 'treatment', 'device']::text[]
  );
