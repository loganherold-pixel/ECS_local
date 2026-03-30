/**
 * ECS Premium Icon Registry
 * ─────────────────────────────────────────────────────────────
 * Maps icon keys to uploaded ECS product image URLs.
 * These are high-resolution product renders on white backgrounds
 * with metallic dimensional styling and gold accent lines.
 *
 * Icon Tile Spec:
 *   Container: 72×72px
 *   Render:    60×60px
 *   Background: #F2F2F2
 *   Border radius: 16px
 *   No gradients, no shadows, no tinting
 */

// ════════════════════════════════════════════════════════════
// IMAGE URL CONSTANTS
// ════════════════════════════════════════════════════════════

const IMG = {
  smartcap:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827405752_15708c85.png',
  bedCover:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827407541_123f9838.png',
  bedRack:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827409060_e1f44d23.png',
  bikeRack:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827410965_adc26d60.png',
  cabRack:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827412594_34c7ad10.png',
  fullBins:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827414468_2fb56a84.png',
  aluCab:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827416679_95306cb8.png',
  otherTopper:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827418580_4e504c83.png',
  hitchCargoCarrier:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827420406_c5ec4cec.png',
  hitchReceiver:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827422228_ef42a474.png',
  none:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827424734_e4efe947.png',
  openBed:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827426867_bb7c3022.png',
  halfBins:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827428986_94cc676c.png',
  recoveryMount:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827430766_80b93f7a.png',
  rtt:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827432415_8a9a6e73.png',
  singleDrawer:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827433551_72bdce90.png',
  slideoutKitchen:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827435299_af8835b4.png',
  smartcapExploded:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827437171_7cd7ac55.png',
  storageBox:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827439157_102af566.png',
  tireCarrier:
    'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771827440794_466b75aa.png',
};

// ════════════════════════════════════════════════════════════
// ICON KEY → URL MAP
// ════════════════════════════════════════════════════════════

export type EcsProductIconKey =
  | 'cab-rack'
  | 'bed-rack'
  | 'bed-cover'
  | 'smartcap'
  | 'alu-cab'
  | 'other-topper'
  | 'open-bed'
  | 'storage-box'
  | 'rtt'
  | 'half-bins'
  | 'full-bins'
  | 'single-drawer'
  | 'dual-drawer'
  | 'slideout-kitchen'
  | 'hitch-receiver'
  | 'tire-carrier'
  | 'bike-rack'
  | 'recovery-mount'
  | 'hitch-cargo-carrier'
  | 'none';

export const ECS_PRODUCT_ICONS: Record<EcsProductIconKey, string> = {
  'cab-rack': IMG.cabRack,
  'bed-rack': IMG.bedRack,
  'bed-cover': IMG.bedCover,
  'smartcap': IMG.smartcap,
  'alu-cab': IMG.aluCab,
  'other-topper': IMG.otherTopper,
  'open-bed': IMG.openBed,
  'storage-box': IMG.storageBox,
  'rtt': IMG.rtt,
  'half-bins': IMG.halfBins,
  'full-bins': IMG.fullBins,
  'single-drawer': IMG.singleDrawer,
  'dual-drawer': IMG.fullBins,
  'slideout-kitchen': IMG.slideoutKitchen,
  'hitch-receiver': IMG.hitchReceiver,
  'tire-carrier': IMG.tireCarrier,
  'bike-rack': IMG.bikeRack,
  'recovery-mount': IMG.recoveryMount,
  'hitch-cargo-carrier': IMG.hitchCargoCarrier,
  'none': IMG.none,
};

/**
 * Resolve an icon key to its product image URL.
 * Returns null if the key is not found.
 */
export function resolveProductIconUrl(key: EcsProductIconKey | string): string | null {
  return (ECS_PRODUCT_ICONS as Record<string, string>)[key] ?? null;
}



