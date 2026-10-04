import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Calendar as CalendarIcon, Check, Sparkles, UserCheck } from 'lucide-react';

interface WheelDatePickerModalProps {
  value: string; // YYYY-MM-DD
  onSave: (dateStr: string) => void;
  onClose: () => void;
}

const ITEM_HEIGHT = 42; // px per item in the drum
const VISIBLE_COUNT = 5; // 5 items visible (center is index 2)

export const WheelDatePickerModal: React.FC<WheelDatePickerModalProps> = ({
  value,
  onSave,
  onClose
}) => {
  const currentYear = new Date().getFullYear();

  // Parse initial value (default to 18 years ago)
  const parsed = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return { year: y, month: m, day: d };
      }
    }
    return { year: currentYear - 18, month: 1, day: 1 };
  }, [value, currentYear]);

  const [selectedDay, setSelectedDay] = useState<number>(parsed.day || 1);
  const [selectedMonth, setSelectedMonth] = useState<number>(parsed.month || 1);
  const [selectedYear, setSelectedYear] = useState<number>(parsed.year || currentYear - 18);

  const dayListRef = useRef<HTMLDivElement>(null);
  const monthListRef = useRef<HTMLDivElement>(null);
  const yearListRef = useRef<HTMLDivElement>(null);

  const isUserScrollingRef = useRef(false);

  // Maximum days in the selected month & year
  const maxDays = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Adjust day if selectedDay > maxDays (e.g. Feb 30 -> Feb 28/29)
  useEffect(() => {
    if (selectedDay > maxDays) {
      setSelectedDay(maxDays);
    }
  }, [maxDays, selectedDay]);

  const days = useMemo(() => {
    return Array.from({ length: maxDays }, (_, i) => i + 1);
  }, [maxDays]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  const years = useMemo(() => {
    const list: number[] = [];
    const start = currentYear;
    const end = 1920;
    for (let y = start; y >= end; y--) {
      list.push(y);
    }
    return list;
  }, [currentYear]);

  // Scroll a specific column to its selected value
  const scrollColumnToValue = useCallback((colRef: React.RefObject<HTMLDivElement | null>, index: number, smooth = true) => {
    const el = colRef.current;
    if (!el) return;
    const targetTop = index * ITEM_HEIGHT;
    el.scrollTo({
      top: targetTop,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }, []);

  // Initial scroll to current selection on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const dayIdx = Math.max(0, selectedDay - 1);
      const monthIdx = Math.max(0, selectedMonth - 1);
      const yearIdx = Math.max(0, years.indexOf(selectedYear));

      scrollColumnToValue(dayListRef, dayIdx, false);
      scrollColumnToValue(monthListRef, monthIdx, false);
      scrollColumnToValue(yearListRef, yearIdx, false);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  // Handle scroll events on Day column
  const handleDayScroll = () => {
    const el = dayListRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const validIdx = Math.max(0, Math.min(idx, days.length - 1));
    const newDay = days[validIdx];
    if (newDay && newDay !== selectedDay) {
      setSelectedDay(newDay);
    }
  };

  // Handle scroll events on Month column
  const handleMonthScroll = () => {
    const el = monthListRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const validIdx = Math.max(0, Math.min(idx, months.length - 1));
    const newMonth = months[validIdx];
    if (newMonth && newMonth !== selectedMonth) {
      setSelectedMonth(newMonth);
    }
  };

  // Handle scroll events on Year column
  const handleYearScroll = () => {
    const el = yearListRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const validIdx = Math.max(0, Math.min(idx, years.length - 1));
    const newYear = years[validIdx];
    if (newYear && newYear !== selectedYear) {
      setSelectedYear(newYear);
    }
  };

  // Calculated Age
  const calculatedAge = useMemo(() => {
    const age = currentYear - selectedYear;
    return age >= 0 ? `${age} tuổi` : '';
  }, [selectedYear, currentYear]);

  // Apply selection
  const handleApply = () => {
    const formattedMonth = String(selectedMonth).padStart(2, '0');
    const formattedDay = String(selectedDay).padStart(2, '0');
    onSave(`${selectedYear}-${formattedMonth}-${formattedDay}`);
    onClose();
  };

  // Quick age preset jump
  const handleSetQuickAge = (targetAge: number) => {
    const y = currentYear - targetAge;
    setSelectedYear(y);
    const yIdx = years.indexOf(y);
    if (yIdx !== -1) {
      scrollColumnToValue(yearListRef, yIdx, true);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-xl animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm sm:max-w-md bg-slate-900/98 border border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-emerald-950/50 space-y-4 animate-in zoom-in-95 duration-200 text-slate-100 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow trang trí */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* HEADER MODAL */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-md">
              <CalendarIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Chọn Ngày Sinh</span>
                {calculatedAge && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                    {calculatedAge}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">Lăn chuột hoặc vuốt chạm để cuộn chọn</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-400 hover:text-white border border-slate-700/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PREVIEW DISPLAY: Hiển thị ngày đã chọn to rõ */}
        <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/30 text-center relative z-10 shadow-inner">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            Ngày đã chọn
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tracking-wide mt-0.5 flex items-center justify-center gap-2">
            <span>{String(selectedDay).padStart(2, '0')}</span>
            <span className="text-slate-600">/</span>
            <span>{String(selectedMonth).padStart(2, '0')}</span>
            <span className="text-slate-600">/</span>
            <span>{selectedYear}</span>
          </div>
          <div className="text-xs text-slate-300 mt-0.5">
            Ngày {selectedDay} tháng {selectedMonth} năm {selectedYear}
          </div>
        </div>

        {/* 3 CON LĂN CUỘN TRÒN (WHEEL DRUM PICKER: NGÀY • THÁNG • NĂM) */}
        <div className="relative z-10 bg-slate-950/90 rounded-2xl border border-slate-800 p-2 overflow-hidden shadow-inner">
          {/* Header tên 3 cột */}
          <div className="grid grid-cols-3 text-center pb-2 border-b border-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span>Ngày</span>
            <span>Tháng</span>
            <span>Năm</span>
          </div>

          {/* Vùng cuộn 3 cột có thanh highlight ở giữa */}
          <div 
            className="relative grid grid-cols-3"
            style={{ height: `${ITEM_HEIGHT * VISIBLE_COUNT}px` }}
          >
            {/* Thanh Highlight ở chính giữa (Center Selection Bar) */}
            <div 
              className="absolute left-0 right-0 pointer-events-none z-10 rounded-xl bg-emerald-500/15 border-y-2 border-emerald-500/60 shadow-lg shadow-emerald-500/10"
              style={{
                top: `${ITEM_HEIGHT * 2}px`,
                height: `${ITEM_HEIGHT}px`
              }}
            />

            {/* Cột 1: NGÀY (1 -> 31) */}
            <div 
              ref={dayListRef}
              onScroll={handleDayScroll}
              className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none text-center relative z-20"
              style={{ scrollBehavior: 'smooth' }}
            >
              {/* Padding trên để căn giữa */}
              <div style={{ height: `${ITEM_HEIGHT * 2}px` }} />
              {days.map((d) => {
                const isSelected = d === selectedDay;
                return (
                  <div
                    key={`day-${d}`}
                    onClick={() => {
                      setSelectedDay(d);
                      const idx = days.indexOf(d);
                      scrollColumnToValue(dayListRef, idx, true);
                    }}
                    style={{ height: `${ITEM_HEIGHT}px` }}
                    className={`snap-center flex items-center justify-center cursor-pointer transition-all duration-150 font-mono text-sm ${
                      isSelected 
                        ? 'text-white font-bold text-lg scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]' 
                        : 'text-slate-500 hover:text-slate-300 font-medium'
                    }`}
                  >
                    {String(d).padStart(2, '0')}
                  </div>
                );
              })}
              {/* Padding dưới để căn giữa */}
              <div style={{ height: `${ITEM_HEIGHT * 2}px` }} />
            </div>

            {/* Cột 2: THÁNG (1 -> 12) */}
            <div 
              ref={monthListRef}
              onScroll={handleMonthScroll}
              className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none text-center relative z-20 border-x border-slate-800/60"
              style={{ scrollBehavior: 'smooth' }}
            >
              <div style={{ height: `${ITEM_HEIGHT * 2}px` }} />
              {months.map((m) => {
                const isSelected = m === selectedMonth;
                return (
                  <div
                    key={`month-${m}`}
                    onClick={() => {
                      setSelectedMonth(m);
                      const idx = months.indexOf(m);
                      scrollColumnToValue(monthListRef, idx, true);
                    }}
                    style={{ height: `${ITEM_HEIGHT}px` }}
                    className={`snap-center flex items-center justify-center cursor-pointer transition-all duration-150 font-mono text-sm ${
                      isSelected 
                        ? 'text-white font-bold text-lg scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]' 
                        : 'text-slate-500 hover:text-slate-300 font-medium'
                    }`}
                  >
                    Tháng {m}
                  </div>
                );
              })}
              <div style={{ height: `${ITEM_HEIGHT * 2}px` }} />
            </div>

            {/* Cột 3: NĂM (2026 -> 1920) */}
            <div 
              ref={yearListRef}
              onScroll={handleYearScroll}
              className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none text-center relative z-20"
              style={{ scrollBehavior: 'smooth' }}
            >
              <div style={{ height: `${ITEM_HEIGHT * 2}px` }} />
              {years.map((y) => {
                const isSelected = y === selectedYear;
                return (
                  <div
                    key={`year-${y}`}
                    onClick={() => {
                      setSelectedYear(y);
                      const idx = years.indexOf(y);
                      scrollColumnToValue(yearListRef, idx, true);
                    }}
                    style={{ height: `${ITEM_HEIGHT}px` }}
                    className={`snap-center flex items-center justify-center cursor-pointer transition-all duration-150 font-mono text-sm ${
                      isSelected 
                        ? 'text-white font-bold text-lg scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]' 
                        : 'text-slate-500 hover:text-slate-300 font-medium'
                    }`}
                  >
                    {y}
                  </div>
                );
              })}
              <div style={{ height: `${ITEM_HEIGHT * 2}px` }} />
            </div>
          </div>
        </div>

        {/* NÚT CHỌN NHANH ĐỘ TUỔI */}
        <div className="flex items-center justify-between gap-1.5 pt-1 relative z-10 flex-wrap">
          <span className="text-[10px] text-slate-500 font-semibold uppercase">Chọn nhanh:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {[16, 18, 20, 25, 30].map((age) => (
              <button
                key={age}
                type="button"
                onClick={() => handleSetQuickAge(age)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  currentYear - selectedYear === age
                    ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                {age} tuổi
              </button>
            ))}
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800 relative z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Xác nhận ngày sinh</span>
          </button>
        </div>
      </div>
    </div>
  );
};
