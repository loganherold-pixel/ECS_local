/**
 * ECS Modular Attachment SVGs
 * ─────────────────────────────────────────────────────────
 * Bed modules (truck only), roof modules, hitch modules.
 *
 * All modules use absolute coordinates that align with
 * base vehicle anchor points. No scaling or repositioning
 * needed during composition.
 *
 * Module shapes are designed to overlay on the FULLSIZE_TRUCK
 * and MIDSIZE_TRUCK base anchors. The VehicleCompositor
 * handles coordinate translation for other bases.
 */

import { ModuleDefinition, VehicleAnchors } from './spec';

// ════════════════════════════════════════════════════════
// HELPER: Generate module paths relative to vehicle anchors
// ════════════════════════════════════════════════════════

/**
 * Generate bed module paths for a specific vehicle's anchors.
 * Only applicable to vehicles with hasBed === true.
 */
export function getBedModulePaths(
  anchors: VehicleAnchors,
  moduleType: string
): ModuleDefinition | null {
  if (!anchors.hasBed || !anchors.bedStartX || !anchors.bedEndX || !anchors.bedTopY) {
    return null;
  }

  const bsx = anchors.bedStartX;
  const bex = anchors.bedEndX;
  const bty = anchors.bedTopY;
  const bfy = anchors.bedFloorY ?? 620;
  const R = 6;

  switch (moduleType) {
    case 'bed_open':
      return {
        type: 'bed_open',
        name: 'Open Bed',
        category: 'bed',
        shapes: [],
        isEmpty: true,
      };

    case 'bed_rack': {
      // Simplified mass shape — no individual bars
      // Uprights + top rail as solid block
      const rackTop = bty - 80;
      const rackInset = 12;
      const uprightW = 14;
      const railH = 10;

      return {
        type: 'bed_rack',
        name: 'Bed Rack',
        category: 'bed',
        shapes: [
          // Top rail (solid rectangle)
          {
            d: [
              `M ${bsx + rackInset} ${rackTop}`,
              `L ${bex - rackInset} ${rackTop}`,
              `C ${bex - rackInset + R} ${rackTop} ${bex - rackInset + R} ${rackTop + railH} ${bex - rackInset} ${rackTop + railH}`,
              `L ${bsx + rackInset} ${rackTop + railH}`,
              `C ${bsx + rackInset - R} ${rackTop + railH} ${bsx + rackInset - R} ${rackTop} ${bsx + rackInset} ${rackTop}`,
              `Z`,
            ].join(' '),
          },
          // Left upright
          {
            d: [
              `M ${bsx + rackInset + 2} ${rackTop + railH}`,
              `L ${bsx + rackInset + 2 + uprightW} ${rackTop + railH}`,
              `L ${bsx + rackInset + 2 + uprightW} ${bty}`,
              `L ${bsx + rackInset + 2} ${bty}`,
              `Z`,
            ].join(' '),
          },
          // Right upright
          {
            d: [
              `M ${bex - rackInset - 2 - uprightW} ${rackTop + railH}`,
              `L ${bex - rackInset - 2} ${rackTop + railH}`,
              `L ${bex - rackInset - 2} ${bty}`,
              `L ${bex - rackInset - 2 - uprightW} ${bty}`,
              `Z`,
            ].join(' '),
          },
          // Center upright
          {
            d: [
              `M ${(bsx + bex) / 2 - uprightW / 2} ${rackTop + railH}`,
              `L ${(bsx + bex) / 2 + uprightW / 2} ${rackTop + railH}`,
              `L ${(bsx + bex) / 2 + uprightW / 2} ${bty}`,
              `L ${(bsx + bex) / 2 - uprightW / 2} ${bty}`,
              `Z`,
            ].join(' '),
          },
        ],
      };
    }

    case 'bed_shell': {
      // Continuous roof block from cab C-pillar to tailgate
      const shellTop = anchors.roofY + 4; // Slightly below cab roof
      const shellRear = bex + 2;

      return {
        type: 'bed_shell',
        name: 'Camper Shell',
        category: 'bed',
        shapes: [
          {
            d: [
              `M ${bsx - 4} ${shellTop}`,
              `C ${bsx - 4} ${shellTop - R} ${bsx - 4 + R} ${shellTop - R} ${bsx + R} ${shellTop}`,
              `L ${shellRear - R} ${shellTop}`,
              `C ${shellRear} ${shellTop} ${shellRear + 2} ${shellTop + R} ${shellRear + 2} ${shellTop + R * 2}`,
              `L ${shellRear + 2} ${bty}`,
              `L ${bsx - 4} ${bty}`,
              `Z`,
            ].join(' '),
          },
          // Rear window cutout
          {
            d: [
              `M ${shellRear - 40} ${shellTop + 12}`,
              `L ${shellRear - 8} ${shellTop + 12}`,
              `C ${shellRear - 5} ${shellTop + 12} ${shellRear - 3} ${shellTop + 14} ${shellRear - 3} ${shellTop + 17}`,
              `L ${shellRear - 3} ${shellTop + 42}`,
              `C ${shellRear - 3} ${shellTop + 45} ${shellRear - 5} ${shellTop + 47} ${shellRear - 8} ${shellTop + 47}`,
              `L ${shellRear - 40} ${shellTop + 47}`,
              `C ${shellRear - 43} ${shellTop + 47} ${shellRear - 45} ${shellTop + 45} ${shellRear - 45} ${shellTop + 42}`,
              `L ${shellRear - 45} ${shellTop + 17}`,
              `C ${shellRear - 45} ${shellTop + 14} ${shellRear - 43} ${shellTop + 12} ${shellRear - 40} ${shellTop + 12}`,
              `Z`,
            ].join(' '),
            fillRule: 'evenodd' as const,
          },
        ],
      };
    }

    default:
      return null;
  }
}



/**
 * Generate roof module paths for a specific vehicle's anchors.
 */

export function getRoofModulePaths(
  anchors: VehicleAnchors,
  moduleType: string
): ModuleDefinition | null {
  const rfx = anchors.roofFrontX;
  const rrx = anchors.roofRearX;
  const ry = anchors.roofY;
  const R = 6;

  switch (moduleType) {
    case 'roof_none':
      return {
        type: 'roof_none',
        name: 'No Roof Module',
        category: 'roof',
        shapes: [],
        isEmpty: true,
      };

    case 'roof_rack': {
      // Simplified rectangle base sitting flush on roofline
      const rackH = 16;
      const rackInset = 20;
      const rackTop = ry - rackH;
      const legW = 8;
      const legH = 6;

      return {
        type: 'roof_rack',
        name: 'Roof Rack',
        category: 'roof',
        shapes: [
          // Main rack platform
          {
            d: [
              `M ${rfx + rackInset} ${rackTop}`,
              `L ${rrx - rackInset} ${rackTop}`,
              `C ${rrx - rackInset + R} ${rackTop} ${rrx - rackInset + R} ${rackTop + rackH} ${rrx - rackInset} ${rackTop + rackH}`,
              `L ${rfx + rackInset} ${rackTop + rackH}`,
              `C ${rfx + rackInset - R} ${rackTop + rackH} ${rfx + rackInset - R} ${rackTop} ${rfx + rackInset} ${rackTop}`,
              `Z`,
            ].join(' '),
          },
          // Front leg
          {
            d: [
              `M ${rfx + rackInset + 10} ${ry - legH}`,
              `L ${rfx + rackInset + 10 + legW} ${ry - legH}`,
              `L ${rfx + rackInset + 10 + legW} ${ry}`,
              `L ${rfx + rackInset + 10} ${ry}`,
              `Z`,
            ].join(' '),
          },
          // Rear leg
          {
            d: [
              `M ${rrx - rackInset - 10 - legW} ${ry - legH}`,
              `L ${rrx - rackInset - 10} ${ry - legH}`,
              `L ${rrx - rackInset - 10} ${ry}`,
              `L ${rrx - rackInset - 10 - legW} ${ry}`,
              `Z`,
            ].join(' '),
          },
        ],
      };
    }

    case 'roof_storage': {
      // Roof rack + cargo blocks (Pelican cases, gear bags)
      // Includes the rack platform PLUS cargo items on top
      const rackH = 16;
      const rackInset = 20;
      const rackTop = ry - rackH;
      const legW = 8;
      const legH = 6;

      // Cargo block dimensions
      const cargoGap = 8;
      const rackLeft = rfx + rackInset;
      const rackRight = rrx - rackInset;
      const rackWidth = rackRight - rackLeft;

      // Three cargo blocks of varying sizes
      const block1W = rackWidth * 0.32;
      const block2W = rackWidth * 0.28;
      const block3W = rackWidth * 0.26;
      const block1H = 36;
      const block2H = 42;
      const block3H = 30;

      const block1X = rackLeft + cargoGap;
      const block2X = block1X + block1W + cargoGap;
      const block3X = block2X + block2W + cargoGap;

      const cargoMaxY = Math.max(360, ry - 80); // Respect cargo vertical limit

      return {
        type: 'roof_storage',
        name: 'Roof Storage',
        category: 'roof',
        shapes: [
          // Main rack platform
          {
            d: [
              `M ${rackLeft} ${rackTop}`,
              `L ${rackRight} ${rackTop}`,
              `C ${rackRight + R} ${rackTop} ${rackRight + R} ${rackTop + rackH} ${rackRight} ${rackTop + rackH}`,
              `L ${rackLeft} ${rackTop + rackH}`,
              `C ${rackLeft - R} ${rackTop + rackH} ${rackLeft - R} ${rackTop} ${rackLeft} ${rackTop}`,
              `Z`,
            ].join(' '),
          },
          // Front leg
          {
            d: [
              `M ${rackLeft + 10} ${ry - legH}`,
              `L ${rackLeft + 10 + legW} ${ry - legH}`,
              `L ${rackLeft + 10 + legW} ${ry}`,
              `L ${rackLeft + 10} ${ry}`,
              `Z`,
            ].join(' '),
          },
          // Rear leg
          {
            d: [
              `M ${rackRight - 10 - legW} ${ry - legH}`,
              `L ${rackRight - 10} ${ry - legH}`,
              `L ${rackRight - 10} ${ry}`,
              `L ${rackRight - 10 - legW} ${ry}`,
              `Z`,
            ].join(' '),
          },
          // Cargo Block 1 — tall Pelican-style case (left)
          {
            d: [
              `M ${block1X + 3} ${rackTop - block1H}`,
              `L ${block1X + block1W - 3} ${rackTop - block1H}`,
              `C ${block1X + block1W} ${rackTop - block1H} ${block1X + block1W} ${rackTop - block1H + 3} ${block1X + block1W} ${rackTop - block1H + 3}`,
              `L ${block1X + block1W} ${rackTop}`,
              `L ${block1X} ${rackTop}`,
              `L ${block1X} ${rackTop - block1H + 3}`,
              `C ${block1X} ${rackTop - block1H} ${block1X} ${rackTop - block1H} ${block1X + 3} ${rackTop - block1H}`,
              `Z`,
            ].join(' '),
          },
          // Cargo Block 2 — taller gear bag (center)
          {
            d: [
              `M ${block2X + 4} ${rackTop - block2H}`,
              `L ${block2X + block2W - 4} ${rackTop - block2H}`,
              `C ${block2X + block2W} ${rackTop - block2H} ${block2X + block2W} ${rackTop - block2H + 4} ${block2X + block2W} ${rackTop - block2H + 4}`,
              `L ${block2X + block2W} ${rackTop}`,
              `L ${block2X} ${rackTop}`,
              `L ${block2X} ${rackTop - block2H + 4}`,
              `C ${block2X} ${rackTop - block2H} ${block2X} ${rackTop - block2H} ${block2X + 4} ${rackTop - block2H}`,
              `Z`,
            ].join(' '),
          },
          // Cargo Block 3 — shorter case (right, with rounded top like a duffel)
          {
            d: [
              `M ${block3X} ${rackTop}`,
              `L ${block3X} ${rackTop - block3H + 8}`,
              `C ${block3X} ${rackTop - block3H} ${block3X + block3W * 0.2} ${rackTop - block3H - 4} ${block3X + block3W * 0.5} ${rackTop - block3H - 4}`,
              `C ${block3X + block3W * 0.8} ${rackTop - block3H - 4} ${block3X + block3W} ${rackTop - block3H} ${block3X + block3W} ${rackTop - block3H + 8}`,
              `L ${block3X + block3W} ${rackTop}`,
              `Z`,
            ].join(' '),
          },
        ],
      };
    }

    case 'roof_tent': {
      // Wedge/rectangular block for rooftop tent
      // Must not exceed CARGO_MAX (Y=360)
      const tentH = 60;
      const tentInset = 15;
      const tentTop = Math.max(ry - tentH, 360); // Respect cargo limit
      const tentBot = ry;

      return {
        type: 'roof_tent',
        name: 'Rooftop Tent',
        category: 'roof',
        shapes: [
          {
            d: [
              `M ${rfx + tentInset} ${tentBot}`,
              `L ${rfx + tentInset} ${tentTop + R}`,
              `C ${rfx + tentInset} ${tentTop} ${rfx + tentInset + R} ${tentTop} ${rfx + tentInset + R} ${tentTop}`,
              `L ${rrx - tentInset - R} ${tentTop}`,
              `C ${rrx - tentInset} ${tentTop} ${rrx - tentInset} ${tentTop} ${rrx - tentInset} ${tentTop + R}`,
              `L ${rrx - tentInset} ${tentBot}`,
              `Z`,
            ].join(' '),
          },
          // Fold line detail (horizontal seam)
          {
            d: [
              `M ${rfx + tentInset + 8} ${tentTop + (tentBot - tentTop) * 0.45}`,
              `L ${rrx - tentInset - 8} ${tentTop + (tentBot - tentTop) * 0.45}`,
              `L ${rrx - tentInset - 8} ${tentTop + (tentBot - tentTop) * 0.45 + 4}`,
              `L ${rfx + tentInset + 8} ${tentTop + (tentBot - tentTop) * 0.45 + 4}`,
              `Z`,
            ].join(' '),
            fillRule: 'evenodd' as const,
          },
        ],
      };
    }

    default:
      return null;
  }
}



/**
 * Generate hitch module paths for a specific vehicle's anchors.
 */
export function getHitchModulePaths(
  anchors: VehicleAnchors,
  moduleType: string
): ModuleDefinition | null {
  const hx = anchors.hitchX;
  const hy = anchors.hitchY;
  const uy = anchors.undercarriageY;
  // Max extension: 8% of vehicle width
  const vw = anchors.rearX - anchors.frontX;
  const maxExt = Math.round(vw * 0.08);

  switch (moduleType) {
    case 'hitch_none':
      return {
        type: 'hitch_none',
        name: 'No Hitch Module',
        category: 'hitch',
        shapes: [],
        isEmpty: true,
      };

    case 'hitch_tire': {
      // Spare tire carrier — circle mass flush with rear
      const tireR = 38;
      const tireCX = hx + tireR + 4;
      const tireCY = hy - 20;

      // Carrier arm
      const armY = uy - 10;

      return {
        type: 'hitch_tire',
        name: 'Tire Carrier',
        category: 'hitch',
        shapes: [
          // Receiver tube
          {
            d: [
              `M ${hx} ${uy - 14}`,
              `L ${hx + 20} ${uy - 14}`,
              `L ${hx + 20} ${uy - 4}`,
              `L ${hx} ${uy - 4}`,
              `Z`,
            ].join(' '),
          },
          // Carrier arm (vertical)
          {
            d: [
              `M ${hx + 6} ${armY}`,
              `L ${hx + 16} ${armY}`,
              `L ${hx + 16} ${tireCY + tireR + 4}`,
              `L ${hx + 6} ${tireCY + tireR + 4}`,
              `Z`,
            ].join(' '),
          },
          // Spare tire (solid circle with hub cutout)
          {
            d: [
              // Outer circle (clockwise)
              `M ${tireCX} ${tireCY - tireR}`,
              `A ${tireR} ${tireR} 0 1 1 ${tireCX} ${tireCY + tireR}`,
              `A ${tireR} ${tireR} 0 1 1 ${tireCX} ${tireCY - tireR}`,
              `Z`,
              // Inner hub cutout (counter-clockwise)
              `M ${tireCX} ${tireCY - 14}`,
              `A 14 14 0 1 0 ${tireCX} ${tireCY + 14}`,
              `A 14 14 0 1 0 ${tireCX} ${tireCY - 14}`,
              `Z`,
            ].join(' '),
            fillRule: 'evenodd' as const,
          },
        ],
      };
    }

    case 'hitch_box': {
      // Rectangular utility box flush with rear bumper
      const boxW = maxExt;
      const boxH = 60;
      const boxTop = uy - boxH - 10;
      const R = 5;

      return {
        type: 'hitch_box',
        name: 'Utility Box',
        category: 'hitch',
        shapes: [
          // Receiver tube
          {
            d: [
              `M ${hx} ${uy - 14}`,
              `L ${hx + 20} ${uy - 14}`,
              `L ${hx + 20} ${uy - 4}`,
              `L ${hx} ${uy - 4}`,
              `Z`,
            ].join(' '),
          },
          // Box body
          {
            d: [
              `M ${hx + 2} ${boxTop + R}`,
              `C ${hx + 2} ${boxTop} ${hx + 2 + R} ${boxTop} ${hx + 2 + R} ${boxTop}`,
              `L ${hx + boxW - R} ${boxTop}`,
              `C ${hx + boxW} ${boxTop} ${hx + boxW} ${boxTop} ${hx + boxW} ${boxTop + R}`,
              `L ${hx + boxW} ${boxTop + boxH - R}`,
              `C ${hx + boxW} ${boxTop + boxH} ${hx + boxW} ${boxTop + boxH} ${hx + boxW - R} ${boxTop + boxH}`,
              `L ${hx + 2 + R} ${boxTop + boxH}`,
              `C ${hx + 2} ${boxTop + boxH} ${hx + 2} ${boxTop + boxH} ${hx + 2} ${boxTop + boxH - R}`,
              `Z`,
            ].join(' '),
          },
          // Latch detail (small rectangle)
          {
            d: [
              `M ${hx + boxW / 2 - 8} ${boxTop + boxH / 2 - 3}`,
              `L ${hx + boxW / 2 + 8} ${boxTop + boxH / 2 - 3}`,
              `L ${hx + boxW / 2 + 8} ${boxTop + boxH / 2 + 3}`,
              `L ${hx + boxW / 2 - 8} ${boxTop + boxH / 2 + 3}`,
              `Z`,
            ].join(' '),
            fillRule: 'evenodd' as const,
          },
        ],
      };
    }

    default:
      return null;
  }
}


// ── Convenience: get all modules for a vehicle ──────────
export function getAvailableModules(anchors: VehicleAnchors) {
  return {
    bed: anchors.hasBed
      ? ['bed_open', 'bed_rack', 'bed_shell']
      : [],
    roof: ['roof_none', 'roof_rack', 'roof_storage', 'roof_tent'],
    hitch: ['hitch_none', 'hitch_tire', 'hitch_box'],
  };
}



