import React, { useEffect, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cleanDateStr, getCurrentJalaliDate, jalaliToGregorian } from '../lib/dateUtils';

interface CalendarJalaliDateInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  showTodayButton?: boolean;
}

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];
const WEEK_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const readJalaliParts = (date: string) => {
  const match = cleanDateStr(date).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
};

const daysInJalaliMonth = (year: number, month: number) => {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const first = jalaliToGregorian(year, month, 1);
  const next = jalaliToGregorian(nextYear, nextMonth, 1);
  const firstUtc = Date.UTC(first.gy, first.gm - 1, first.gd);
  const nextUtc = Date.UTC(next.gy, next.gm - 1, next.gd);
  return Math.round((nextUtc - firstUtc) / 86400000);
};

export const CalendarJalaliDateInput: React.FC<CalendarJalaliDateInputProps> = ({
  id,
  name,
  value,
  onChange,
  placeholder = 'مثال: ۱۴۰۵/۰۶/۲۴',
  required = false,
  className = '',
  inputClassName = '',
  disabled = false,
  showTodayButton = false
}) => {
  const [internalValue, setInternalValue] = useState(value || '');
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const current = readJalaliParts(value) || readJalaliParts(getCurrentJalaliDate())!;
    return { year: current.year, month: current.month };
  });

  useEffect(() => {
    setInternalValue(value || '');
    const date = readJalaliParts(value);
    if (date && date.month >= 1 && date.month <= 12) {
      setVisibleMonth({ year: date.year, month: date.month });
    }
  }, [value]);

  const validate = (date: string) => {
    const clean = cleanDateStr(date);
    if (!clean) {
      setError(required ? 'ورود تاریخ الزامی است.' : null);
      return;
    }

    const match = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (!match) {
      setError('فرمت تاریخ باید به صورت سال/ماه/روز باشد.');
      return;
    }

    const [, yearPart, monthPart, dayPart] = match;
    const year = Number(yearPart);
    const month = Number(monthPart);
    const day = Number(dayPart);
    const maxDay = month >= 1 && month <= 12 ? daysInJalaliMonth(year, month) : 0;
    if (year < 1200 || year > 1600 || month < 1 || month > 12 || day < 1 || day > maxDay) {
      setError('تاریخ واردشده معتبر نیست.');
      return;
    }

    setError(null);
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = cleanDateStr(event.target.value).replace(/-/g, '/').replace(/[^0-9/]/g, '');
    const digits = cleaned.replace(/\//g, '');
    let masked = cleaned;
    if (digits.length > 4 && !cleaned.includes('/')) {
      masked = `${digits.slice(0, 4)}/${digits.slice(4)}`;
    }
    const parts = masked.split('/');
    if (parts.length === 2 && parts[1].length > 2) {
      masked = `${parts[0]}/${parts[1].slice(0, 2)}/${parts[1].slice(2)}`;
    }

    setInternalValue(masked);
    onChange(masked);
    if (masked.length >= 8 || (!masked && required)) validate(masked);
    else setError(null);
  };

  const handleBlur = () => {
    if (!internalValue) {
      validate('');
      return;
    }
    const parts = cleanDateStr(internalValue).split(/[/-]/);
    if (parts.length === 3) {
      const normalized = `${parts[0].padStart(4, '0')}/${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}`;
      setInternalValue(normalized);
      onChange(normalized);
      validate(normalized);
    } else {
      validate(internalValue);
    }
  };

  const shiftMonth = (offset: number) => {
    const absoluteMonth = visibleMonth.year * 12 + visibleMonth.month - 1 + offset;
    setVisibleMonth({
      year: Math.floor(absoluteMonth / 12),
      month: (absoluteMonth % 12) + 1
    });
  };

  const selectCalendarDay = (day: number) => {
    const jalali = `${visibleMonth.year}/${String(visibleMonth.month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    setInternalValue(jalali);
    onChange(jalali);
    setError(null);
    setCalendarOpen(false);
  };

  const firstDay = jalaliToGregorian(visibleMonth.year, visibleMonth.month, 1);
  const leadingDays = (new Date(firstDay.gy, firstDay.gm - 1, firstDay.gd).getDay() + 1) % 7;
  const monthLength = daysInJalaliMonth(visibleMonth.year, visibleMonth.month);
  const dayCells = Array.from({ length: Math.ceil((leadingDays + monthLength) / 7) * 7 }, (_, index) => {
    const day = index - leadingDays + 1;
    return day >= 1 && day <= monthLength ? day : null;
  });
  const selectedDate = readJalaliParts(internalValue);
  const today = readJalaliParts(getCurrentJalaliDate())!;

  const setToday = () => {
    const today = getCurrentJalaliDate();
    setInternalValue(today);
    onChange(today);
    setError(null);
  };

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          value={internalValue}
          onChange={handleTextChange}
          onBlur={handleBlur}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          maxLength={10}
          dir="ltr"
          className={`w-full p-2.5 pr-10 bg-slate-50 border rounded-xl text-xs font-mono text-center focus:outline-hidden ${
            error ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 focus:ring-2 focus:ring-blue-500 focus:bg-white'
          } ${inputClassName}`}
        />
        <button
          type="button"
          onClick={() => setCalendarOpen(open => !open)}
          disabled={disabled}
          aria-expanded={calendarOpen}
          aria-label="باز کردن تقویم"
          title="انتخاب تاریخ از تقویم"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 disabled:cursor-not-allowed"
        >
          <Calendar className="w-4 h-4" />
        </button>
        {calendarOpen && (
          <div
            role="dialog"
            aria-label="تقویم شمسی"
            onKeyDown={event => {
              if (event.key === 'Escape') setCalendarOpen(false);
            }}
            className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
            dir="rtl"
          >
            <div className="mb-3 flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="ماه قبل" className="rounded-lg p-1.5 hover:bg-slate-100">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-slate-700">
                {JALALI_MONTHS[visibleMonth.month - 1]} {visibleMonth.year}
              </span>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="ماه بعد" className="rounded-lg p-1.5 hover:bg-slate-100">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
              {WEEK_DAYS.map(day => <span key={day} className="py-1">{day}</span>)}
              {dayCells.map((day, index) => day === null ? (
                <span key={`empty-${index}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectCalendarDay(day)}
                  aria-pressed={selectedDate?.year === visibleMonth.year && selectedDate.month === visibleMonth.month && selectedDate.day === day}
                  className={`rounded-lg py-1.5 text-xs hover:bg-blue-50 ${
                    selectedDate?.year === visibleMonth.year && selectedDate.month === visibleMonth.month && selectedDate.day === day
                      ? 'bg-blue-600 font-bold text-white hover:bg-blue-700'
                      : today.year === visibleMonth.year && today.month === visibleMonth.month && today.day === day
                        ? 'font-bold text-blue-700 ring-1 ring-blue-300'
                        : 'text-slate-700'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {showTodayButton && (
        <button type="button" onClick={setToday} disabled={disabled} className="text-[10px] text-blue-600 hover:underline">
          امروز
        </button>
      )}
      {error && <p role="alert" className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
};
