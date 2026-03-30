/**
 * DatePickerField — Tactical Calendar Date Picker
 *
 * Features:
 * - Popup calendar for clicking exact day/month/year
 * - Manual entry in MMDDYYYY format with auto-dashes (MM-DD-YYYY)
 * - Month/year navigation
 * - Styled to match the tactical theme
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import ECSModal from './ECSModal';

import { COLORS, SPACING, RADIUS } from '../lib/theme';

interface DatePickerFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/**
 * Parse a date string in various formats and return { month, day, year }
 * Supports: MM-DD-YYYY, YYYY-MM-DD, MM/DD/YYYY
 */
function parseDate(str: string | null): { month: number; day: number; year: number } | null {
  if (!str) return null;
  const cleaned = str.replace(/\//g, '-');

  // Try MM-DD-YYYY
  const mmddyyyy = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (mmddyyyy) {
    const m = parseInt(mmddyyyy[1], 10);
    const d = parseInt(mmddyyyy[2], 10);
    const y = parseInt(mmddyyyy[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      return { month: m - 1, day: d, year: y };
    }
  }

  // Try YYYY-MM-DD
  const yyyymmdd = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const y = parseInt(yyyymmdd[1], 10);
    const m = parseInt(yyyymmdd[2], 10);
    const d = parseInt(yyyymmdd[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      return { month: m - 1, day: d, year: y };
    }
  }

  return null;
}

/**
 * Format a date as MM-DD-YYYY
 */
function formatDate(month: number, day: number, year: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${mm}-${dd}-${year}`;
}

/**
 * Auto-format raw digits into MM-DD-YYYY with dashes
 */
function autoFormatDateInput(raw: string): string {
  // Strip everything except digits
  const digits = raw.replace(/[^\d]/g, '');

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 8)}`;
}

export default function DatePickerField({ label, value, onChange, placeholder }: DatePickerFieldProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [inputText, setInputText] = useState('');
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [showYearPicker, setShowYearPicker] = useState(false);

  // Parse the current value to highlight in calendar
  const parsed = parseDate(value);

  // Sync inputText with value prop
  useEffect(() => {
    if (value) {
      const p = parseDate(value);
      if (p) {
        setInputText(formatDate(p.month, p.day, p.year));
      } else {
        setInputText(value);
      }
    } else {
      setInputText('');
    }
  }, [value]);

  // When calendar opens, set view to current value or today
  const openCalendar = () => {
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    } else {
      const now = new Date();
      setViewYear(now.getFullYear());
      setViewMonth(now.getMonth());
    }
    setShowYearPicker(false);
    setShowCalendar(true);
  };

  // Handle manual text input with auto-formatting
  const handleTextChange = (text: string) => {
    const formatted = autoFormatDateInput(text);
    setInputText(formatted);

    // If complete (MM-DD-YYYY = 10 chars), validate and emit
    if (formatted.length === 10) {
      const p = parseDate(formatted);
      if (p) {
        onChange(formatDate(p.month, p.day, p.year));
      }
    } else if (formatted.length === 0) {
      onChange('');
    }
  };

  // Handle day selection from calendar
  const selectDay = (day: number) => {
    const dateStr = formatDate(viewMonth, day, viewYear);
    onChange(dateStr);
    setInputText(dateStr);
    setShowCalendar(false);
  };

  // Navigate months
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const calendarDays: (number | null)[] = [];

  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  // Pad to complete rows
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  const isSelected = (day: number) => {
    if (!parsed) return false;
    return parsed.year === viewYear && parsed.month === viewMonth && parsed.day === day;
  };

  const isToday = (day: number) => {
    const now = new Date();
    return now.getFullYear() === viewYear && now.getMonth() === viewMonth && now.getDate() === day;
  };

  // Year picker range
  const currentYear = new Date().getFullYear();
  const yearRange: number[] = [];
  for (let y = currentYear - 5; y <= currentYear + 10; y++) yearRange.push(y);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={handleTextChange}
          placeholder={placeholder || 'MM-DD-YYYY'}
          placeholderTextColor={COLORS.textMuted}
          keyboardType="number-pad"
          maxLength={10}
        />
        <TouchableOpacity style={styles.calendarBtn} onPress={openCalendar}>
          <Ionicons name="calendar-outline" size={18} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      {/* Calendar Modal */}
      <ECSModal visible={showCalendar} onClose={() => setShowCalendar(false)} tier="global">

        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCalendar(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.calendarContainer}>
            {/* Calendar Header */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={20} color={COLORS.gold} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.monthYearBtn}
                onPress={() => setShowYearPicker(!showYearPicker)}
              >
                <Text style={styles.monthYearText}>
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
                <Ionicons
                  name={showYearPicker ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={COLORS.gold}
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gold} />
              </TouchableOpacity>
            </View>

            {/* Year/Month Picker */}
            {showYearPicker ? (
              <View style={styles.yearPickerContainer}>
                {/* Year Selection */}
                <Text style={styles.pickerSectionLabel}>YEAR</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.yearScroll}
                  contentContainerStyle={styles.yearScrollContent}
                >
                  {yearRange.map(y => (
                    <TouchableOpacity
                      key={y}
                      style={[
                        styles.yearChip,
                        y === viewYear && styles.yearChipActive,
                      ]}
                      onPress={() => setViewYear(y)}
                    >
                      <Text style={[
                        styles.yearChipText,
                        y === viewYear && styles.yearChipTextActive,
                      ]}>
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Month Selection */}
                <Text style={styles.pickerSectionLabel}>MONTH</Text>
                <View style={styles.monthGrid}>
                  {MONTH_SHORT.map((m, idx) => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.monthChip,
                        idx === viewMonth && styles.monthChipActive,
                      ]}
                      onPress={() => {
                        setViewMonth(idx);
                        setShowYearPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.monthChipText,
                        idx === viewMonth && styles.monthChipTextActive,
                      ]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <>
                {/* Day Headers */}
                <View style={styles.dayHeaderRow}>
                  {DAY_HEADERS.map(d => (
                    <View key={d} style={styles.dayHeaderCell}>
                      <Text style={styles.dayHeaderText}>{d}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Grid */}
                <View style={styles.calendarGrid}>
                  {calendarDays.map((day, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.dayCell,
                        day && isSelected(day) && styles.dayCellSelected,
                        day && isToday(day) && !isSelected(day) && styles.dayCellToday,
                      ]}
                      onPress={() => day && selectDay(day)}
                      disabled={!day}
                      activeOpacity={0.6}
                    >
                      {day ? (
                        <Text style={[
                          styles.dayText,
                          isSelected(day) && styles.dayTextSelected,
                          isToday(day) && !isSelected(day) && styles.dayTextToday,
                        ]}>
                          {day}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Today Button */}
            <View style={styles.calendarFooter}>
              <TouchableOpacity
                style={styles.todayBtn}
                onPress={() => {
                  const now = new Date();
                  selectDay(now.getDate());
                  setViewYear(now.getFullYear());
                  setViewMonth(now.getMonth());
                }}
              >
                <Ionicons name="today-outline" size={14} color={COLORS.gold} />
                <Text style={styles.todayBtnText}>TODAY</Text>
              </TouchableOpacity>

              {value ? (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => {
                    onChange('');
                    setInputText('');
                    setShowCalendar(false);
                  }}
                >
                  <Ionicons name="close-circle-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.clearBtnText}>CLEAR</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </ECSModal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: RADIUS.sm,
    borderBottomLeftRadius: RADIUS.sm,
    borderRightWidth: 0,
    padding: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  calendarBtn: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopRightRadius: RADIUS.sm,
    borderBottomRightRadius: RADIUS.sm,
    padding: SPACING.sm,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarContainer: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
    width: 320,
    maxWidth: '90%',
    overflow: 'hidden',
  },

  // Calendar Header
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  navBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
  },
  monthYearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
  },
  monthYearText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gold,
    letterSpacing: 0.5,
  },

  // Year/Month Picker
  yearPickerContainer: {
    padding: 12,
  },
  pickerSectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 4,
  },
  yearScroll: {
    marginBottom: 12,
  },
  yearScrollContent: {
    gap: 6,
    paddingVertical: 4,
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgInput,
    marginRight: 6,
  },
  yearChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldMuted,
  },
  yearChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  yearChipTextActive: {
    color: COLORS.gold,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  monthChip: {
    width: '23%',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
  },
  monthChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldMuted,
  },
  monthChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  monthChipTextActive: {
    color: COLORS.gold,
  },

  // Day Headers
  dayHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
  },

  // Calendar Grid
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayCellSelected: {
    backgroundColor: COLORS.gold,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
    backgroundColor: COLORS.goldMuted,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dayTextSelected: {
    color: '#000',
    fontWeight: '800',
  },
  dayTextToday: {
    color: COLORS.gold,
    fontWeight: '700',
  },

  // Footer
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.goldMuted,
  },
  todayBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.gold,
    letterSpacing: 1,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.bgElevated,
  },
  clearBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
});



