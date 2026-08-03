/**
 * skeleton กลางของทุกหน้าใน (app) — โชว์ทันทีที่กดเมนู ระหว่างรอ server ดึงข้อมูล
 * การมีไฟล์นี้ทำให้ Next prefetch โครงหน้า dynamic ล่วงหน้าได้ด้วย (ไม่มี = กดแล้วจอค้างจนกว่า server ตอบ)
 * หน้าที่เลย์เอาต์ต่างมาก (เช่น /tasks บอร์ด full-bleed) มี loading.tsx ของตัวเองทับได้
 */
export default function AppLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full animate-pulse px-3 py-4 sm:px-6 sm:py-6">
        {/* หัวข้อหน้า */}
        <div className="mb-6 space-y-2">
          <div className="h-6 w-48 rounded-lg bg-white/60" />
          <div className="h-4 w-72 max-w-full rounded-lg bg-white/40" />
        </div>
        {/* การ์ดเนื้อหา */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-5 shadow-sm">
              <div className="h-4 w-2/3 rounded bg-white/70" />
              <div className="mt-3 h-3 w-full rounded bg-white/50" />
              <div className="mt-2 h-3 w-4/5 rounded bg-white/50" />
              <div className="mt-4 h-20 rounded-lg bg-white/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
