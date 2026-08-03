/** skeleton ของหน้า Price List สาธารณะ — โชว์ระหว่างสตรีมข้อมูลราคา (หน้านี้ถูกเปิดจากลิงก์แชร์บ่อย) */
export default function PriceListLoading() {
  return (
    <div className="min-h-dvh animate-pulse px-4 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        {/* หัวเรื่อง + ช่องค้นหา */}
        <div className="mx-auto h-7 w-56 rounded-lg bg-white/60" />
        <div className="mx-auto mt-2 h-4 w-72 max-w-full rounded-lg bg-white/40" />
        <div className="mt-6 h-11 w-full rounded-xl bg-white/50" />
        {/* แท็บกลุ่ม */}
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-24 rounded-full bg-white/50" />
          ))}
        </div>
        {/* แถวรายการ */}
        <div className="mt-5 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 shadow-sm">
              <div className="h-4 w-2/3 rounded bg-white/70" />
              <div className="mt-2 h-3 w-1/3 rounded bg-white/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
