/** skeleton ของหน้า Task — เลียนโครงบอร์ดการ์ด full-bleed (แถบตัวกรอง + คอลัมน์แนวนอน) */
export default function TasksLoading() {
  return (
    <div className="flex h-full animate-pulse flex-col overflow-hidden">
      {/* แถบหัว + ตัวกรอง */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-4 sm:px-6">
        <div className="h-6 w-24 rounded-lg bg-white/60" />
        <div className="h-9 w-40 rounded-lg bg-white/50" />
        <div className="h-9 w-32 rounded-lg bg-white/50" />
        <div className="h-9 w-28 rounded-lg bg-white/50" />
      </div>
      {/* คอลัมน์บอร์ด */}
      <div className="flex flex-1 gap-4 overflow-hidden px-3 pb-4 sm:px-6">
        {Array.from({ length: 3 }).map((_, col) => (
          <div
            key={col}
            className="glass-soft flex min-w-[86vw] flex-col gap-3 rounded-xl p-3 sm:min-w-[340px] sm:max-w-[340px]"
          >
            <div className="h-5 w-32 rounded bg-white/60" />
            {Array.from({ length: 3 }).map((_, card) => (
              <div key={card} className="glass rounded-xl p-4 shadow-sm">
                <div className="h-4 w-3/4 rounded bg-white/70" />
                <div className="mt-3 h-3 w-1/2 rounded bg-white/50" />
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-white/60" />
                  <div className="h-3 w-20 rounded bg-white/50" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
