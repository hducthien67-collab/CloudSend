import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Calendar as CalendarIcon, Check, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';

interface CompactWheelDatePickerProps {
  value: string; // YYYY-MM-DD
  onSave: (dateStr: string) => void;
  onClose: () => void;
}

const ITEM_HEIGHT = 38; // px per item in the drum
const VISIBLE_COUNT = 5; // 5 visible rows, middle row is index 2

export const CompactWheelDatePicker: React.FC<CompactWheelDatePickerProps> = ({
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

  const containerRef = useRef<HTMLDivElement>(null);
  const dayListRef = useRef<HTMLDivElement>(null);
  const monthListRef = useRef<HTMLDivElement>(null);
  const yearListRef = useRef<HTMLDivElement>(null);

  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<Record<string, any>>({});
  const lastWheelTimestampRef = useRef<Record<string, number>>({ day: 0, month: 0, year: 0 });

  // Maximum days in the selected month & year
  const maxDays = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Adjust day if selectedDay > maxDays (e.g., Feb 30 -> Feb 28/29)
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
    }, 60);

    return () => clearTimeout(timer);
  }, []);

  // Click outside listener to close automatically
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [onClose]);

  // Smooth mouse wheel handlers per column: exactly 1 unit (+1 or -1) per wheel notch/gesture
  const handleWheel = (
    e: React.WheelEvent,
    type: 'day' | 'month' | 'year',
    colRef: React.RefObject<HTMLDivElement | null>,
    currentVal: number,
    list: number[],
    setter: (val: number) => void
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const el = colRef.current;
    if (!el) return;

    const now = Date.now();
    // Throttle wheel events by 130ms so 1 physical wheel notch strictly advances 1 single unit
    if (now - (lastWheelTimestampRef.current[type] || 0) < 130) {
      return;
    }
    lastWheelTimestampRef.current[type] = now;

    const direction = e.deltaY > 0 ? 1 : -1;
    const currentIdx = list.indexOf(currentVal);
    const nextIdx = Math.max(0, Math.min(currentIdx + direction, list.length - 1));
    const nextVal = list[nextIdx];

    if (nextVal !== undefined) {
      setter(nextVal);
      scrollColumnToValue(colRef, nextIdx, true);
    }
  };

  // Scroll event listeners with debounce for touch/drag
  const handleScroll = (
    type: 'day' | 'month' | 'year',
    colRef: React.RefObject<HTMLDivElement | null>,
    list: number[],
    setter: (val: number) => void
  ) => {
    const el = colRef.current;
    if (!el) return;

    if (scrollTimeoutRef.current[type]) {
      clearTimeout(scrollTimeoutRef.current[type]);
    }

    scrollTimeoutRef.current[type] = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const validIdx = Math.max(0, Math.min(idx, list.length - 1));
      const val = list[validIdx];
      if (val !== undefined) {
        setter(val);
      }
    }, 80);
  };

  // Age calculation
  const calculatedAge = useMemo(() => {
    const age = currentYear - selectedYear;
    return age >= 0 ? `${age} tuổi` : '';
  }, [selectedYear, currentYear]);

  // Confirm and apply
  const handleApply = () => {
    const formattedMonth = String(selectedMonth).padStart(2, '0');
    const formattedDay = String(selectedDay).padStart(2, '0');
    onSave(`${selectedYear}-${formattedMonth}-${formattedDay}`);
    onClose();
  };

  const handleClear = () => {
    onSave('');
    onClose();
  };

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 mt-2 z-50 w-full max-w-[340px] sm:max-w-[360px] bg-slate-900/98 border border-emerald-500/50 rounded-2xl shadow-2xl shadow-slate-950/80 p-3.5 space-y-3 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-200 text-slate-100 select-none ring-1 ring-emerald-500/20"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header bar: Compact title & Preview */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Cuộn chọn ngày sinh</span>
              {calculatedAge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 font-mono font-semibold">
                  {calculatedAge}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">Lăn chuột hoặc vuốt ngón tay để cuộn</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Đóng bảng"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Date Preview Display */}
      <div className="py-1.5 px-3 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between">
        <span className="text-[11px] text-slate-400 font-medium">Ngày đang chọn:</span>
        <span className="text-sm font-bold font-mono text-emerald-400 tracking-wider">
          {String(selectedDay).padStart(2, '0')} / {String(selectedMonth).padStart(2, '0')} / {selectedYear}
        </span>
      </div>

      {/* 3 Drum Columns: Ngày • Tháng • Năm */}
      <div className="relative bg-slate-950/90 rounded-xl border border-slate-800/90 p-1.5 overflow-hidden">
        {/* Column labels */}
        <div className="grid grid-cols-3 text-center pb-1 border-b border-slate-800/70 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <span>Ngày</span>
          <span>Tháng</span>
          <span>Năm</span>
        </div>

        {/* Scroll area container */}
        <div
          className="relative grid grid-cols-3"
          style={{ height: `${ITEM_HEIGHT * VISIBLE_COUNT}px` }}
        >
          {/* Active Highlight Band in the Middle */}
          <div
            className="absolute left-0 right-0 pointer-events-none z-10 rounded-lg bg-emerald-500/15 border-y border-emerald-500/60 shadow-sm"
            style={{
              top: `${ITEM_HEIGHT * 2}px`,
              height: `${ITEM_HEIGHT}px`
            }}
          />

          {/* Top/Bottom gradient shadows */}
          <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-slate-950 via-slate-950/70 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent pointer-events-none z-10" />

          {/* COLUMN 1: NGÀY */}
          <div
            ref={dayListRef}
            onWheel={(e) => handleWheel(e, 'day', dayListRef, selectedDay, days, setSelectedDay)}
            onScroll={() => handleScroll('day', dayListRef, days, setSelectedDay)}
            className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none text-center relative z-20 touch-pan-y"
          >
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
                  className={`snap-center flex items-center justify-center cursor-pointer transition-all duration-100 font-mono text-sm ${
                    isSelected
                      ? 'text-white font-bold text-base scale-105 drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                      : 'text-slate-500 hover:text-slate-300 font-medium'
                  }`}
                >
                  {String(d).padStart(2, '0')}
                </div>
              );
            })}
            <div style={{ height: `${ITEM_HEIGHT * 2}px` }} />
          </div>

          {/* COLUMN 2: THÁNG */}
          <div
            ref={monthListRef}
            onWheel={(e) => handleWheel(e, 'month', monthListRef, selectedMonth, months, setSelectedMonth)}
            onScroll={() => handleScroll('month', monthListRef, months, setSelectedMonth)}
            className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none text-center relative z-20 touch-pan-y border-x border-slate-800/60"
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
                  className={`snap-center flex items-center justify-center cursor-pointer transition-all duration-100 font-mono text-xs sm:text-sm ${
                    isSelected
                      ? 'text-white font-bold text-sm scale-105 drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                      : 'text-slate-500 hover:text-slate-300 font-medium'
                  }`}
                >
                  Tháng {m}
                </div>
              );
            })}
            <div style={{ height: `${ITEM_HEIGHT * 2}px` }} />
          </div>

          {/* COLUMN 3: NĂM */}
          <div
            ref={yearListRef}
            onWheel={(e) => handleWheel(e, 'year', yearListRef, selectedYear, years, setSelectedYear)}
            onScroll={() => handleScroll('year', yearListRef, years, setSelectedYear)}
            className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none text-center relative z-20 touch-pan-y"
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
                  className={`snap-center flex items-center justify-center cursor-pointer transition-all duration-100 font-mono text-sm ${
                    isSelected
                      ? 'text-white font-bold text-base scale-105 drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]'
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

      {/* Action Footer Buttons */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleClear}
          className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition-colors cursor-pointer"
        >
          Xóa
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-all cursor-pointer active:scale-95"
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span>Xong</span>
          </button>
        </div>
      </div>
    </div>
  );
};
