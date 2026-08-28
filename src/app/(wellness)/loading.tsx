/**
 * skeleton กลางของทุกหน้าในระบบ Wellness — โชว์ทันทีที่กดเมนู ระหว่างรอ server ดึงข้อมูล
 * (ต้องมีไฟล์นี้แยกจาก (app)/loading.tsx เพราะคนละ route group; ไม่มี = กดแล้วจอค้างจนกว่า server ตอบ)
 *
 * ดีไซน์ (ผู้ใช้ 2026-08-28: "พอลงมา detail มันเว้นว่างไว้เยอะเพื่ออะไรก็ไม่รู้"):
 * ของเดิมเป็นกล่องสูงๆ สีจางเกือบกลืนพื้นหลัง = ดูเหมือนหน้าว่างเปล่า →
 * เปลี่ยนเป็น **การ์ดสั้นๆ หน้าตาเหมือนลิสต์จริง + แถบสีเข้มพอให้เห็นว่ากำลังโหลด**
 */
export default function WellnessLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl animate-pulse px-3 pb-6 pt-4 sm:px-6 sm:pt-6">
        {/* แถบค้นหา */}
        <div className="h-11 rounded-full bg-white/80 shadow-sm" />

        {/* ชิปสรุป */}
        <div className="mt-3 flex gap-2">
          <div className="h-8 w-28 rounded-full bg-white/70" />
          <div className="h-8 w-32 rounded-full bg-white/70" />
          <div className="h-8 w-24 rounded-full bg-white/70" />
        </div>

        {/* การ์ดลิสต์ — สัดส่วนเดียวกับแถวจริง จะได้ไม่กระโดดตอนข้อมูลมา */}
        <div className="mt-5 space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl bg-white/90 px-3.5 py-3.5 shadow-sm ring-1 ring-stone-200/60"
            >
              <div className="h-11 w-11 shrink-0 rounded-full bg-brand-100/80" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/5 rounded bg-stone-200/70" />
                <div className="h-3.5 w-4/5 rounded bg-stone-100" />
                <div className="h-3 w-1/3 rounded bg-stone-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
