import React, { useState, useMemo } from 'react';
import { X, Calendar, Check, Sparkles, Sliders, ArrowRight, UserCheck } from 'lucide-react';

interface CustomDatePickerModalProps {
  value: string; // YYYY-MM-DD
  onSave: (dateStr: string) => void;
  onClose: () => void;
}

/**
 * Bảng điều chỉnh Ngày Sinh ở giữa màn hình:
 * - Nằm ở lớp trên cùng (z-[100]) với hiệu ứng làm mờ toàn bộ nền xung quanh (backdrop-blur-xl).
 * - Có 3 thanh trượt điều chỉnh: Ngày (1 -> 31), Tháng (1 -> 12), Năm (1920 -> 2026).
 * - Tự động tính toán số ngày tối đa theo tháng/năm và hiển thị số tuổi tương ứng.
 */
export const CustomDatePickerModal: React.FC<CustomDatePickerModalProps> = ({
  value,
  onSave,
  onClose
}) => {
  const currentYear = new Date().getFullYear();

  const parsed = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return { year: y, month: m, day: d };
      }
    }
    // Mặc định gợi ý độ tuổi 18-20
    return { year: currentYear - 18, month: 1, day: 1 };
  }, [value, currentYear]);

  const [day, setDay] = useState<number>(parsed.day || 1);
  const [month, setMonth] = useState<number>(parsed.month || 1);
  const [year, setYear] = useState<number>(parsed.year || currentYear - 18);

  // Tính số ngày tối đa theo tháng và năm
  const maxDays = useMemo(() => {
    return new Date(year, month, 0).getDate();
  }, [year, month]);

  // Điều chỉnh day nếu vượt quá maxDays
  const validDay = Math.min(day, maxDays);

  const calculatedAge = useMemo(() => {
    const age = currentYear - year;
    return age >= 0 ? `${age} tuổi` : '';
  }, [year, currentYear]);

  const handleApply = () => {
    const formattedMonth = String(month).padStart(2, '0');
    const formattedDay = String(validDay).padStart(2, '0');
    onSave(`${year}-${formattedMonth}-${formattedDay}`);
    onClose();
  };

  const handleSetQuickAge = (targetAge: number) => {
    setYear(currentYear - targetAge);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-xl animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-slate-900/98 border border-emerald-500/40 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-emerald-950/50 space-y-5 animate-in zoom-in-95 duration-200 text-slate-100 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow trang trí nền */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* HEADER MODAL */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
              <Sliders className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Chọn Ngày Sinh (Thanh Trượt)</span>
                {calculatedAge && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                    {calculatedAge}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Kéo trượt thanh Ngày • Tháng • Năm mượt mà</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition-colors"
            title="Đóng bảng trượt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* KHUNG KẾT QUẢ HIỂN THỊ NỔI BẬT */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/40 text-center shadow-inner space-y-1 relative overflow-hidden">
          <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest font-mono flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Thời gian đã chọn</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-wider font-mono">
            {String(validDay).padStart(2, '0')} / {String(month).padStart(2, '0')} / {year}
          </div>
          <p className="text-xs text-slate-300 font-medium">
            Ngày {validDay} tháng {month} năm {year} {calculatedAge ? `(${calculatedAge})` : ''}
          </p>
        </div>

        {/* CÁC NÚT CHỌN NHANH ĐỘ TUỔI */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400 font-medium mr-1">Tuổi nhanh:</span>
          {[16, 18, 20, 22, 25, 30].map((quickAge) => (
            <button
              key={quickAge}
              type="button"
              onClick={() => handleSetQuickAge(quickAge)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                currentYear - year === quickAge
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-emerald-300 border border-slate-700/60'
              }`}
            >
              {quickAge}t
            </button>
          ))}
        </div>

        {/* 3 THANH TRƯỢT: NGÀY - THÁNG - NĂM */}
        <div className="space-y-4 pt-1">
          {/* 1. THANH TRƯỢT NGÀY */}
          <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-200 flex items-center gap-2">
                <span>📅 Ngày sinh:</span>
                <strong className="text-emerald-400 text-sm font-mono font-black">
                  {String(validDay).padStart(2, '0')}
                </strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDay((prev) => Math.max(1, prev - 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm active:scale-90"
                >
                  -
                </button>
                <span className="text-[11px] text-slate-400 font-mono w-12 text-center">1 - {maxDays}</span>
                <button
                  type="button"
                  onClick={() => setDay((prev) => Math.min(maxDays, prev + 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm active:scale-90"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={maxDays}
              value={validDay}
              onChange={(e) => setDay(Number(e.target.value))}
              className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
            />
          </div>

          {/* 2. THANH TRƯỢT THÁNG */}
          <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-200 flex items-center gap-2">
                <span>🗓️ Tháng sinh:</span>
                <strong className="text-teal-400 text-sm font-mono font-black">
                  Tháng {month}
                </strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMonth((prev) => Math.max(1, prev - 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm active:scale-90"
                >
                  -
                </button>
                <span className="text-[11px] text-slate-400 font-mono w-12 text-center">1 - 12</span>
                <button
                  type="button"
                  onClick={() => setMonth((prev) => Math.min(12, prev + 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm active:scale-90"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400 focus:outline-none"
            />
          </div>

          {/* 3. THANH TRƯỢT NĂM */}
          <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-200 flex items-center gap-2">
                <span>🎂 Năm sinh:</span>
                <strong className="text-emerald-400 text-sm font-mono font-black">
                  {year}
                </strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setYear((prev) => Math.max(1920, prev - 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm active:scale-90"
                >
                  -
                </button>
                <span className="text-[11px] text-slate-400 font-mono w-16 text-center">1920 - {currentYear}</span>
                <button
                  type="button"
                  onClick={() => setYear((prev) => Math.min(currentYear, prev + 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm active:scale-90"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              min={1920}
              max={currentYear}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
            />
          </div>
        </div>

        {/* NÚT HÀNH ĐỘNG */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-300 hover:text-white font-semibold text-xs sm:text-sm transition-colors border border-slate-700/60 active:scale-95"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all active:scale-95 border border-emerald-400/40"
          >
            <Check className="w-4 h-4" />
            <span>Áp Dụng Ngày Sinh</span>
          </button>
        </div>
      </div>
    </div>
  );
};
