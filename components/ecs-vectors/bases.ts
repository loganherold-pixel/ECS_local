/**
 * ECS Base Vehicle Silhouettes
 * ─────────────────────────────────────────────────────────
 * Semi-realistic side-profile solid-fill silhouettes.
 * ViewBox: 0 0 1024 1024 | Baseline Y=820 | Wheels Y=780
 *
 * All paths use fill-rule="evenodd" where cutouts exist.
 * Outer body path winds clockwise.
 * Window/arch cutouts wind counter-clockwise.
 *
 * Style: Industrial, proportionally accurate, no cartoon.
 */

import {
  VehicleDefinition,
  WHEEL,
  Y,
  CORNER_R as R,
} from './spec';

// ── Helpers ─────────────────────────────────────────────
const WCY = Y.WHEEL_CENTER;
const AR = WHEEL.ARCH_R;
const TR = WHEEL.TIRE_R;
const RR = WHEEL.RIM_R;
const HR = WHEEL.HUB_R;

/**
 * Generate a semicircular wheel arch cutout in the body path.
 * Goes from right side to left side of the arch (counter-clockwise
 * when body is clockwise), creating a concave notch.
 */
function archPath(cx: number): string {
  const lx = cx - AR;
  const rx = cx + AR;
  // Arc from right to left, sweeping upward
  return `L ${rx} 748 A ${AR} ${AR} 0 0 1 ${lx} 748`;
}

// ════════════════════════════════════════════════════════
// 1. FULL-SIZE TRUCK (RAM 2500 / F-250 inspired)
//    Crew cab, long bed, overland stance
// ════════════════════════════════════════════════════════

const FULLSIZE_FWX = 280;
const FULLSIZE_RWX = 730;

const fullsizeTruckBody = [
  // Start at front bumper lower-left
  `M 160 718`,
  // Front face up
  `L 160 508`,
  `C 160 502 164 498 170 496`,
  // Hood (slight upward slope)
  `L 304 484`,
  `C 308 483 310 482 312 480`,
  // Windshield (steep rake)
  `L 350 456`,
  `C 352 453 356 451 360 451`,
  // Cab roof
  `L 528 451`,
  `C 534 451 538 454 540 460`,
  // C-pillar / rear cab wall
  `L 548 512`,
  `C 549 516 552 518 556 518`,
  // Bed wall top rail
  `L 832 518`,
  `C 836 518 838 520 838 524`,
  // Tailgate
  `L 838 718`,
  // Rear bumper
  `L 860 718`,
  `C 864 718 866 720 866 724`,
  `L 866 748`,
  `C 866 752 864 754 860 754`,
  // Undercarriage with wheel arches
  `L 838 754`,
  `L 838 748`,
  archPath(FULLSIZE_RWX),
  `L ${FULLSIZE_FWX + AR} 748`,
  archPath(FULLSIZE_FWX),
  `L 160 748`,
  `C 156 748 154 746 154 742`,
  `L 154 724`,
  `C 154 720 156 718 160 718`,
  `Z`,
].join(' ');

const fullsizeWindows = [
  // Windshield
  {
    d: `M 316 488 L 354 458 C 356 456 358 455 360 455 L 362 455 L 362 488 C 362 491 360 493 357 493 L 319 493 C 316 493 315 491 316 488 Z`,
    fillRule: 'evenodd' as const,
  },
  // Front door window
  {
    d: `M 370 455 L 440 455 L 440 490 C 440 493 438 495 435 495 L 370 495 C 367 495 365 493 365 490 L 365 458 C 365 456 367 455 370 455 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear door window
  {
    d: `M 448 455 L 520 455 C 523 455 525 457 525 460 L 525 490 C 525 493 523 495 520 495 L 448 495 C 445 495 443 493 443 490 L 443 458 C 443 456 445 455 448 455 Z`,
    fillRule: 'evenodd' as const,
  },
];

export const FULLSIZE_TRUCK: VehicleDefinition = {
  type: 'fullsize_truck',
  name: 'Full-Size Truck',
  anchors: {
    id: 'fullsize_truck',
    frontX: 154,
    rearX: 866,
    roofY: 451,
    roofFrontX: 360,
    roofRearX: 528,
    bedStartX: 556,
    bedEndX: 838,
    bedTopY: 518,
    bedFloorY: 620,
    frontWheelX: FULLSIZE_FWX,
    rearWheelX: FULLSIZE_RWX,
    undercarriageY: 748,
    hitchX: 866,
    hitchY: 730,
    hasBed: true,
  },
  body: { d: fullsizeTruckBody, fillRule: 'evenodd' },
  windows: fullsizeWindows,
  wheels: [
    [FULLSIZE_FWX, WCY, TR, RR, HR],
    [FULLSIZE_RWX, WCY, TR, RR, HR],
  ],
};


// ════════════════════════════════════════════════════════
// 2. MID-SIZE TRUCK (Tacoma / Colorado inspired)
//    Crew cab, shorter bed, slightly smaller
// ════════════════════════════════════════════════════════

const MIDSIZE_FWX = 295;
const MIDSIZE_RWX = 710;

const midsizeTruckBody = [
  `M 185 718`,
  // Front face
  `L 185 518`,
  `C 185 512 189 508 195 506`,
  // Hood
  `L 318 494`,
  `C 322 493 324 491 326 488`,
  // Windshield
  `L 358 462`,
  `C 360 459 363 457 367 457`,
  // Cab roof
  `L 518 457`,
  `C 523 457 526 460 528 465`,
  // C-pillar
  `L 536 516`,
  `C 537 520 540 522 544 522`,
  // Bed wall
  `L 808 522`,
  `C 812 522 814 524 814 528`,
  // Tailgate
  `L 814 718`,
  // Rear bumper
  `L 838 718`,
  `C 842 718 844 720 844 724`,
  `L 844 748`,
  `C 844 752 842 754 838 754`,
  // Undercarriage
  `L 814 754`,
  `L 814 748`,
  archPath(MIDSIZE_RWX),
  `L ${MIDSIZE_FWX + AR} 748`,
  archPath(MIDSIZE_FWX),
  `L 185 748`,
  `C 181 748 179 746 179 742`,
  `L 179 724`,
  `C 179 720 181 718 185 718`,
  `Z`,
].join(' ');

const midsizeWindows = [
  // Windshield
  {
    d: `M 330 498 L 362 465 C 364 463 366 462 368 462 L 370 462 L 370 496 C 370 499 368 501 365 501 L 333 501 C 330 501 329 499 330 498 Z`,
    fillRule: 'evenodd' as const,
  },
  // Front door window
  {
    d: `M 378 462 L 438 462 L 438 498 C 438 501 436 503 433 503 L 378 503 C 375 503 373 501 373 498 L 373 465 C 373 463 375 462 378 462 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear door window
  {
    d: `M 446 462 L 510 462 C 513 462 515 464 515 467 L 515 498 C 515 501 513 503 510 503 L 446 503 C 443 503 441 501 441 498 L 441 465 C 441 463 443 462 446 462 Z`,
    fillRule: 'evenodd' as const,
  },
];

export const MIDSIZE_TRUCK: VehicleDefinition = {
  type: 'midsize_truck',
  name: 'Mid-Size Truck',
  anchors: {
    id: 'midsize_truck',
    frontX: 179,
    rearX: 844,
    roofY: 457,
    roofFrontX: 367,
    roofRearX: 518,
    bedStartX: 544,
    bedEndX: 814,
    bedTopY: 522,
    bedFloorY: 625,
    frontWheelX: MIDSIZE_FWX,
    rearWheelX: MIDSIZE_RWX,
    undercarriageY: 748,
    hitchX: 844,
    hitchY: 730,
    hasBed: true,
  },
  body: { d: midsizeTruckBody, fillRule: 'evenodd' },
  windows: midsizeWindows,
  wheels: [
    [MIDSIZE_FWX, WCY, TR, RR, HR],
    [MIDSIZE_RWX, WCY, TR, RR, HR],
  ],
};


// ════════════════════════════════════════════════════════
// 3. BOXY SUV (4Runner / Bronco / Land Cruiser inspired)
//    Flat roof, squared-off rear, no bed
// ════════════════════════════════════════════════════════

const SUV_FWX = 275;
const SUV_RWX = 720;

const suvBoxyBody = [
  `M 175 718`,
  // Front face
  `L 175 510`,
  `C 175 504 179 500 185 498`,
  // Hood
  `L 298 486`,
  `C 302 485 304 483 306 480`,
  // Windshield
  `L 342 458`,
  `C 344 455 347 453 351 453`,
  // Roof (long, flat — extends to rear)
  `L 790 453`,
  `C 796 453 800 456 802 462`,
  // Rear pillar (steep, boxy)
  `L 810 510`,
  `C 812 516 814 520 816 524`,
  // Rear face (nearly vertical)
  `L 822 718`,
  // Rear bumper
  `L 846 718`,
  `C 850 718 852 720 852 724`,
  `L 852 748`,
  `C 852 752 850 754 846 754`,
  // Undercarriage
  `L 822 754`,
  `L 822 748`,
  archPath(SUV_RWX),
  `L ${SUV_FWX + AR} 748`,
  archPath(SUV_FWX),
  `L 175 748`,
  `C 171 748 169 746 169 742`,
  `L 169 724`,
  `C 169 720 171 718 175 718`,
  `Z`,
].join(' ');

const suvWindows = [
  // Windshield
  {
    d: `M 310 490 L 346 460 C 348 458 350 457 352 457 L 354 457 L 354 488 C 354 491 352 493 349 493 L 313 493 C 310 493 309 491 310 490 Z`,
    fillRule: 'evenodd' as const,
  },
  // Front door window
  {
    d: `M 362 457 L 440 457 L 440 490 C 440 493 438 495 435 495 L 362 495 C 359 495 357 493 357 490 L 357 460 C 357 458 359 457 362 457 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear door window
  {
    d: `M 448 457 L 530 457 L 530 490 C 530 493 528 495 525 495 L 448 495 C 445 495 443 493 443 490 L 443 460 C 443 458 445 457 448 457 Z`,
    fillRule: 'evenodd' as const,
  },
  // Cargo quarter window
  {
    d: `M 538 457 L 620 457 L 620 490 C 620 493 618 495 615 495 L 538 495 C 535 495 533 493 533 490 L 533 460 C 533 458 535 457 538 457 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear quarter window (smaller, higher)
  {
    d: `M 628 457 L 700 457 L 700 485 C 700 488 698 490 695 490 L 628 490 C 625 490 623 488 623 485 L 623 460 C 623 458 625 457 628 457 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear window
  {
    d: `M 710 460 L 790 460 C 793 460 795 462 795 465 L 798 505 C 798 508 796 510 793 510 L 810 510 L 806 465 C 806 462 804 460 801 460 L 710 460 C 707 460 705 462 705 465 L 705 505 C 705 508 707 510 710 510 L 793 510 C 796 510 798 508 798 505 L 795 465 C 795 462 793 460 790 460 Z`,
    fillRule: 'evenodd' as const,
  },
];

// Simplified rear window for SUV
const suvWindowsClean = [
  // Windshield
  {
    d: `M 310 490 L 346 460 C 348 458 350 457 353 457 L 355 457 L 355 488 C 355 491 353 493 350 493 L 313 493 C 310 493 309 491 310 490 Z`,
    fillRule: 'evenodd' as const,
  },
  // Front door window
  {
    d: `M 363 457 L 440 457 L 440 490 C 440 493 438 495 435 495 L 363 495 C 360 495 358 493 358 490 L 358 460 C 358 458 360 457 363 457 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear door window
  {
    d: `M 448 457 L 530 457 L 530 490 C 530 493 528 495 525 495 L 448 495 C 445 495 443 493 443 490 L 443 460 C 443 458 445 457 448 457 Z`,
    fillRule: 'evenodd' as const,
  },
  // Cargo quarter window
  {
    d: `M 538 457 L 625 457 L 625 490 C 625 493 623 495 620 495 L 538 495 C 535 495 533 493 533 490 L 533 460 C 533 458 535 457 538 457 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear quarter window
  {
    d: `M 633 457 L 710 457 L 710 485 C 710 488 708 490 705 490 L 633 490 C 630 490 628 488 628 485 L 628 460 C 628 458 630 457 633 457 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear hatch window
  {
    d: `M 720 460 L 790 460 C 793 460 795 462 795 465 L 800 505 C 800 508 798 510 795 510 L 720 510 C 717 510 715 508 715 505 L 715 465 C 715 462 717 460 720 460 Z`,
    fillRule: 'evenodd' as const,
  },
];

export const SUV_BOXY: VehicleDefinition = {
  type: 'suv_boxy',
  name: 'Boxy SUV',
  anchors: {
    id: 'suv_boxy',
    frontX: 169,
    rearX: 852,
    roofY: 453,
    roofFrontX: 351,
    roofRearX: 790,
    cargoDoorX: 810,
    frontWheelX: SUV_FWX,
    rearWheelX: SUV_RWX,
    undercarriageY: 748,
    hitchX: 852,
    hitchY: 730,
    hasBed: false,
  },
  body: { d: suvBoxyBody, fillRule: 'evenodd' },
  windows: suvWindowsClean,
  wheels: [
    [SUV_FWX, WCY, TR, RR, HR],
    [SUV_RWX, WCY, TR, RR, HR],
  ],
};


// ════════════════════════════════════════════════════════
// 4. OVERLAND VAN (Sprinter / Transit inspired)
//    Tall roof, long wheelbase, sliding door
// ════════════════════════════════════════════════════════

const VAN_FWX = 280;
const VAN_RWX = 700;

const overlandVanBody = [
  `M 175 718`,
  // Front face — van has a more vertical front
  `L 175 490`,
  `C 175 484 179 480 185 478`,
  // Short hood / front cap
  `L 260 470`,
  `C 264 469 266 467 268 464`,
  // Windshield (very steep, almost vertical)
  `L 290 430`,
  `C 292 426 296 424 300 424`,
  // Roof (very long, flat — van signature)
  `L 810 424`,
  `C 816 424 820 428 820 434`,
  // Rear face (vertical)
  `L 820 718`,
  // Rear bumper
  `L 840 718`,
  `C 844 718 846 720 846 724`,
  `L 846 748`,
  `C 846 752 844 754 840 754`,
  // Undercarriage
  `L 820 754`,
  `L 820 748`,
  archPath(VAN_RWX),
  `L ${VAN_FWX + AR} 748`,
  archPath(VAN_FWX),
  `L 175 748`,
  `C 171 748 169 746 169 742`,
  `L 169 724`,
  `C 169 720 171 718 175 718`,
  `Z`,
].join(' ');

const vanWindows = [
  // Windshield (tall, steep)
  {
    d: `M 270 474 L 294 432 C 296 429 298 428 301 428 L 310 428 L 310 472 C 310 475 308 477 305 477 L 273 477 C 270 477 269 475 270 474 Z`,
    fillRule: 'evenodd' as const,
  },
  // Front door window
  {
    d: `M 318 428 L 390 428 L 390 474 C 390 477 388 479 385 479 L 318 479 C 315 479 313 477 313 474 L 313 431 C 313 429 315 428 318 428 Z`,
    fillRule: 'evenodd' as const,
  },
  // Sliding door window
  {
    d: `M 410 428 L 520 428 L 520 474 C 520 477 518 479 515 479 L 410 479 C 407 479 405 477 405 474 L 405 431 C 405 429 407 428 410 428 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear cargo window (smaller)
  {
    d: `M 640 440 L 720 440 L 720 478 C 720 481 718 483 715 483 L 640 483 C 637 483 635 481 635 478 L 635 443 C 635 441 637 440 640 440 Z`,
    fillRule: 'evenodd' as const,
  },
  // Rear door windows (pair)
  {
    d: `M 760 440 L 808 440 C 811 440 813 442 813 445 L 813 500 C 813 503 811 505 808 505 L 760 505 C 757 505 755 503 755 500 L 755 445 C 755 442 757 440 760 440 Z`,
    fillRule: 'evenodd' as const,
  },
];

export const OVERLAND_VAN: VehicleDefinition = {
  type: 'overland_van',
  name: 'Overland Van',
  anchors: {
    id: 'overland_van',
    frontX: 169,
    rearX: 846,
    roofY: 424,
    roofFrontX: 300,
    roofRearX: 810,
    cargoDoorX: 820,
    frontWheelX: VAN_FWX,
    rearWheelX: VAN_RWX,
    undercarriageY: 748,
    hitchX: 846,
    hitchY: 730,
    hasBed: false,
  },
  body: { d: overlandVanBody, fillRule: 'evenodd' },
  windows: vanWindows,
  wheels: [
    [VAN_FWX, WCY, TR, RR, HR],
    [VAN_RWX, WCY, TR, RR, HR],
  ],
};


// ── All bases registry ──────────────────────────────────
export const VEHICLE_BASES: Record<string, VehicleDefinition> = {
  fullsize_truck: FULLSIZE_TRUCK,
  midsize_truck: MIDSIZE_TRUCK,
  suv_boxy: SUV_BOXY,
  overland_van: OVERLAND_VAN,
};

export function getVehicleBase(type: string): VehicleDefinition | null {
  return VEHICLE_BASES[type] ?? null;
}



