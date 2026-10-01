import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, RotateCcw, Check, Sparkles } from 'lucide-react';

interface CustomCalendarPopoverProps {
  value: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  onClose: () => void;
}

/**
 * Bảng Lịch Mini Tự Làm (Custom Interactive Calendar):
 * - Kích thước to hơn, các ô ngày rộng rãi (h-11, h-12) cực kỳ dễ bấm trên cả Mobile & Desktop.
 * - Nằm ở lớp trên cùng (z-[100]) kèm lớp mờ nền backdrop-blur.
 * - Tích hợp chuyển nhanh Tháng / Năm, nhảy về Hôm nay hoặc xóa lựa chọn.
 */
export const CustomCalendarPopover: React.FC<CustomCalendarPopoverProps> = ({
  value,
  onChange,
  onClose
}) => {
  const initialDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth()); // 0 - 11

  // Ngày hiện tại đã chọn
  const selectedDateObj = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }, [value]);

  const selectedDay = selectedDateObj ? selectedDateObj.getDate() : null;
  const selectedMonth = selectedDateObj ? selectedDateObj.getMonth() : null;
  const selectedYear = selectedDateObj ? selectedDateObj.getFullYear() : null;

  // Tính số ngày và ngày bắt đầu của tháng
  const daysInMonth = useMemo(() => new Date(viewYear, viewMonth + 1, 0).getDate(), [viewYear, viewMonth]);
  const firstDayOfWeek = useMemo(() => new Date(viewYear, viewMonth, 1).getDay(), [viewYear, viewMonth]); // 0 = CN, 1 = T2
  const startingOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // 0: T2, ..., 6: CN

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handlePrevYear = () => setViewYear((y) => y - 1);
  const handleNextYear = () => setViewYear((y) => y + 1);

  const handleSelectDay = (day: number) => {
    const formattedMonth = String(viewMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    onChange(`${viewYear}-${formattedMonth}-${formattedDay}`);
    onClose();
  };

  const weekDays = [
    { label: 'T2', name: 'Thứ 2' },
    { label: 'T3', name: 'Thứ 3' },
    { label: 'T4', name: 'Thứ 4' },
    { label: 'T5', name: 'Thứ 5' },
    { label: 'T6', name: 'Thứ 6' },
    { label: 'T7', name: 'Thứ 7' },
    { label: 'CN', name: 'Chủ Nhật', highlight: true },
  ];

  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ];

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[420px] bg-slate-900/98 border border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-slate-100 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative soft glow */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* HEADER: Chọn Tháng & Năm với nút to, dễ bấm */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/90 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-lg shadow-emerald-500/10 shrink-0">
              <CalendarIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                <span>{monthNames[viewMonth]}</span>
                <span className="text-emerald-400 font-mono">/ {viewYear}</span>
              </h3>
              <p className="text-[11px] text-slate-400">Bảng lịch tự thiết kế • Chạm để chọn ngày</p>
            </div>
          </div>

          {/* Nút đóng */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition-colors"
            title="Đóng bảng lịch"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BỘ ĐIỀU HƯỚNG THÁNG & NĂM NHANH */}
        <div className="grid grid-cols-2 gap-2 relative z-10">
          {/* Điều hướng Tháng */}
          <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-2xl p-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 active:scale-90 transition-all"
              title="Tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-slate-200 px-1 truncate">
              {monthNames[viewMonth]}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 active:scale-90 transition-all"
              title="Tháng sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Điều hướng Năm */}
          <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-2xl p-1.5">
            <button
              type="button"
              onClick={handlePrevYear}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 active:scale-90 transition-all"
              title="Năm trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-emerald-300 font-mono px-1">
              {viewYear}
            </span>
            <button
              type="button"
              onClick={handleNextYear}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 active:scale-90 transition-all"
              title="Năm sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TIÊU ĐỀ CÁC THỨ TRONG TUẦN */}
        <div className="grid grid-cols-7 gap-1.5 text-center font-bold text-xs text-slate-400 pt-1">
          {weekDays.map((wd) => (
            <div 
              key={wd.label} 
              className={`py-1 rounded-lg ${wd.highlight ? 'text-rose-400 bg-rose-500/10' : 'bg-slate-800/30'}`}
              title={wd.name}
            >
              {wd.label}
            </div>
          ))}
        </div>

        {/* LƯỚI CÁC NGÀY TO RÕ RÀNG (RẤT DỄ BẤM TRÊN MỌI THIẾT BỊ) */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
          {/* Khoảng trống đầu tháng */}
          {Array.from({ length: startingOffset }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-10 sm:h-11" />
          ))}

          {/* Các ngày trong tháng */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const isSelected =
              selectedDay === dayNum &&
              selectedMonth === viewMonth &&
              selectedYear === viewYear;

            const isToday =
              new Date().getDate() === dayNum &&
              new Date().getMonth() === viewMonth &&
              new Date().getFullYear() === viewYear;

            return (
              <button
                key={`day-${dayNum}`}
                type="button"
                onClick={() => handleSelectDay(dayNum)}
                className={`h-10 sm:h-11 rounded-2xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center relative active:scale-90 ${
                  isSelected
                    ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 font-black shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-300 scale-105 z-10'
                    : isToday
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30'
                    : 'bg-slate-950/70 hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/40'
                }`}
              >
                <span>{dayNum}</span>
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* FOOTER: PHÍM TẮT CHỌN NHANH */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800/90 text-xs">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const formattedMonth = String(now.getMonth() + 1).padStart(2, '0');
              const formattedDay = String(now.getDate()).padStart(2, '0');
              onChange(`${now.getFullYear()}-${formattedMonth}-${formattedDay}`);
              onClose();
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white font-medium transition-colors flex items-center gap-1.5 border border-slate-700/60 active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hôm nay</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              onChange('');
              onClose();
            }}
            className="px-3.5 py-2 rounded-xl text-rose-400 hover:bg-rose-500/15 font-medium transition-colors border border-transparent hover:border-rose-500/30 active:scale-95 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Xóa ngày</span>
          </button>
        </div>
      </div>
    </div>
  );
};
