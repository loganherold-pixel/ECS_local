/**
 * Vehicle Health & Maintenance — Type Definitions
 */

export type MaintenanceEventType =
  | 'oil_change'
  | 'tire_rotation'
  | 'brake_inspection'
  | 'air_filter'
  | 'transmission_fluid'
  | 'coolant_flush'
  | 'spark_plugs'
  | 'battery_replacement'
  | 'belt_replacement'
  | 'differential_service'
  | 'transfer_case_service'
  | 'wheel_bearing'
  | 'suspension_check'
  | 'alignment'
  | 'fuel_filter'
  | 'cabin_filter'
  | 'wiper_blades'
  | 'general';

export interface MaintenanceLog {
  id: string;
  vehicle_id: string;
  owner_user_id: string;
  event_type: MaintenanceEventType;
  title: string;
  description: string | null;
  event_date: string;
  mileage: number | null;
  cost_cents: number;
  shop_name: string | null;
  parts_used: string | null;
  next_due_mileage: number | null;
  next_due_date: string | null;
  interval_miles: number | null;
  interval_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceLogInsert {
  vehicle_id: string;
  owner_user_id: string;
  event_type: MaintenanceEventType;
  title: string;
  description?: string | null;
  event_date: string;
  mileage?: number | null;
  cost_cents?: number;
  shop_name?: string | null;
  parts_used?: string | null;
  next_due_mileage?: number | null;
  next_due_date?: string | null;
  interval_miles?: number | null;
  interval_days?: number | null;
}

export type InspectionItemStatus = 'pass' | 'fail' | 'warning' | 'pending';

export interface InspectionItem {
  id: string;
  label: string;
  category: string;
  status: InspectionItemStatus;
  notes: string;
  isCritical: boolean;
}

export type InspectionOverallStatus = 'pending' | 'pass' | 'fail' | 'warning';

export interface InspectionChecklist {
  id: string;
  vehicle_id: string;
  expedition_id: string | null;
  owner_user_id: string;
  inspection_date: string;
  overall_status: InspectionOverallStatus;
  mileage: number | null;
  notes: string | null;
  items: InspectionItem[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceReminder {
  eventType: MaintenanceEventType;
  title: string;
  lastServiceDate: string | null;
  lastServiceMileage: number | null;
  nextDueDate: string | null;
  nextDueMileage: number | null;
  intervalMiles: number | null;
  intervalDays: number | null;
  isOverdue: boolean;
  urgency: 'ok' | 'soon' | 'overdue';
}

// ── Event type metadata ─────────────────────────────────────

export interface EventTypeMeta {
  label: string;
  icon: string;
  color: string;
  defaultIntervalMiles: number | null;
  defaultIntervalDays: number | null;
}

export const EVENT_TYPE_META: Record<MaintenanceEventType, EventTypeMeta> = {
  oil_change:           { label: 'Oil Change',           icon: 'water-outline',           color: '#FFB74D', defaultIntervalMiles: 5000,  defaultIntervalDays: 180 },
  tire_rotation:        { label: 'Tire Rotation',        icon: 'sync-outline',            color: '#78909C', defaultIntervalMiles: 7500,  defaultIntervalDays: 180 },
  brake_inspection:     { label: 'Brake Inspection',     icon: 'hand-left-outline',       color: '#EF5350', defaultIntervalMiles: 15000, defaultIntervalDays: 365 },
  air_filter:           { label: 'Air Filter',           icon: 'leaf-outline',            color: '#66BB6A', defaultIntervalMiles: 15000, defaultIntervalDays: 365 },
  transmission_fluid:   { label: 'Transmission Fluid',   icon: 'cog-outline',             color: '#AB47BC', defaultIntervalMiles: 30000, defaultIntervalDays: 730 },
  coolant_flush:        { label: 'Coolant Flush',        icon: 'thermometer-outline',     color: '#42A5F5', defaultIntervalMiles: 30000, defaultIntervalDays: 730 },
  spark_plugs:          { label: 'Spark Plugs',          icon: 'flash-outline',           color: '#FFF176', defaultIntervalMiles: 60000, defaultIntervalDays: null },
  battery_replacement:  { label: 'Battery Replacement',  icon: 'battery-charging-outline',color: '#FFD54F', defaultIntervalMiles: null,  defaultIntervalDays: 1095 },
  belt_replacement:     { label: 'Belt Replacement',     icon: 'repeat-outline',          color: '#A1887F', defaultIntervalMiles: 60000, defaultIntervalDays: null },
  differential_service: { label: 'Differential Service', icon: 'git-merge-outline',       color: '#CE93D8', defaultIntervalMiles: 30000, defaultIntervalDays: 730 },
  transfer_case_service:{ label: 'Transfer Case Service',icon: 'git-branch-outline',      color: '#B39DDB', defaultIntervalMiles: 30000, defaultIntervalDays: 730 },
  wheel_bearing:        { label: 'Wheel Bearing',        icon: 'radio-button-on-outline', color: '#90A4AE', defaultIntervalMiles: 75000, defaultIntervalDays: null },
  suspension_check:     { label: 'Suspension Check',     icon: 'resize-outline',          color: '#4DB6AC', defaultIntervalMiles: 30000, defaultIntervalDays: 365 },
  alignment:            { label: 'Alignment',            icon: 'move-outline',            color: '#4FC3F7', defaultIntervalMiles: 15000, defaultIntervalDays: 365 },
  fuel_filter:          { label: 'Fuel Filter',          icon: 'funnel-outline',          color: '#FF8A65', defaultIntervalMiles: 30000, defaultIntervalDays: 730 },
  cabin_filter:         { label: 'Cabin Filter',         icon: 'grid-outline',            color: '#AED581', defaultIntervalMiles: 15000, defaultIntervalDays: 365 },
  wiper_blades:         { label: 'Wiper Blades',         icon: 'rainy-outline',           color: '#80DEEA', defaultIntervalMiles: null,  defaultIntervalDays: 365 },
  general:              { label: 'General Service',      icon: 'build-outline',           color: '#BDBDBD', defaultIntervalMiles: null,  defaultIntervalDays: null },
};

export const MAINTENANCE_EVENT_TYPES = Object.keys(EVENT_TYPE_META) as MaintenanceEventType[];

// ── Default pre-trip inspection items ───────────────────────

export const DEFAULT_INSPECTION_ITEMS: Omit<InspectionItem, 'id'>[] = [
  // Brakes
  { label: 'Brake Pedal Feel',        category: 'Brakes',    status: 'pending', notes: '', isCritical: true },
  { label: 'Parking Brake',           category: 'Brakes',    status: 'pending', notes: '', isCritical: true },
  { label: 'Brake Fluid Level',       category: 'Brakes',    status: 'pending', notes: '', isCritical: true },
  // Lights
  { label: 'Headlights (Low/High)',   category: 'Lights',    status: 'pending', notes: '', isCritical: true },
  { label: 'Tail Lights',             category: 'Lights',    status: 'pending', notes: '', isCritical: true },
  { label: 'Brake Lights',            category: 'Lights',    status: 'pending', notes: '', isCritical: true },
  { label: 'Turn Signals',            category: 'Lights',    status: 'pending', notes: '', isCritical: true },
  { label: 'Hazard Lights',           category: 'Lights',    status: 'pending', notes: '', isCritical: false },
  { label: 'Auxiliary / Off-road Lights', category: 'Lights', status: 'pending', notes: '', isCritical: false },
  // Fluids
  { label: 'Engine Oil Level',        category: 'Fluids',    status: 'pending', notes: '', isCritical: true },
  { label: 'Coolant Level',           category: 'Fluids',    status: 'pending', notes: '', isCritical: true },
  { label: 'Transmission Fluid',      category: 'Fluids',    status: 'pending', notes: '', isCritical: false },
  { label: 'Power Steering Fluid',    category: 'Fluids',    status: 'pending', notes: '', isCritical: false },
  { label: 'Windshield Washer Fluid', category: 'Fluids',    status: 'pending', notes: '', isCritical: false },
  // Tires
  { label: 'Tire Pressure (All 4+spare)', category: 'Tires', status: 'pending', notes: '', isCritical: true },
  { label: 'Tire Tread Depth',        category: 'Tires',     status: 'pending', notes: '', isCritical: true },
  { label: 'Spare Tire Condition',    category: 'Tires',     status: 'pending', notes: '', isCritical: true },
  { label: 'Lug Nut Torque',          category: 'Tires',     status: 'pending', notes: '', isCritical: false },
  // Drivetrain
  { label: '4WD Engagement Test',     category: 'Drivetrain',status: 'pending', notes: '', isCritical: false },
  { label: 'Differential Lockers',    category: 'Drivetrain',status: 'pending', notes: '', isCritical: false },
  // Electrical
  { label: 'Battery Voltage',         category: 'Electrical',status: 'pending', notes: '', isCritical: true },
  { label: 'Auxiliary Battery',       category: 'Electrical',status: 'pending', notes: '', isCritical: false },
  { label: 'Fuse Box Check',          category: 'Electrical',status: 'pending', notes: '', isCritical: false },
  // Safety
  { label: 'Fire Extinguisher',       category: 'Safety',    status: 'pending', notes: '', isCritical: true },
  { label: 'First Aid Kit',           category: 'Safety',    status: 'pending', notes: '', isCritical: true },
  { label: 'Recovery Gear Secured',   category: 'Safety',    status: 'pending', notes: '', isCritical: false },
  // Body / Exterior
  { label: 'Roof Rack / Load Secured',category: 'Body',      status: 'pending', notes: '', isCritical: true },
  { label: 'Hitch / Tow Setup',       category: 'Body',      status: 'pending', notes: '', isCritical: false },
  { label: 'Mirrors & Visibility',    category: 'Body',      status: 'pending', notes: '', isCritical: true },
  { label: 'Wipers Functional',       category: 'Body',      status: 'pending', notes: '', isCritical: false },
];

// ── Helpers ─────────────────────────────────────────────────

export function generateInspectionItems(): InspectionItem[] {
  return DEFAULT_INSPECTION_ITEMS.map((item, idx) => ({
    ...item,
    id: `insp_${Date.now()}_${idx}`,
  }));
}

export function computeOverallStatus(items: InspectionItem[]): InspectionOverallStatus {
  if (items.length === 0) return 'pending';
  const hasPending = items.some(i => i.status === 'pending');
  if (hasPending) return 'pending';
  const criticalFail = items.some(i => i.isCritical && i.status === 'fail');
  if (criticalFail) return 'fail';
  const anyFail = items.some(i => i.status === 'fail');
  const anyWarn = items.some(i => i.status === 'warning');
  if (anyFail) return 'warning';
  if (anyWarn) return 'warning';
  return 'pass';
}

export function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatMileage(miles: number | null): string {
  if (miles == null) return '--';
  return miles.toLocaleString() + ' mi';
}



