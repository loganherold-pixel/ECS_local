/**
 * Emergency Protocol Data
 *
 * Structured stabilization content for the Emergency dashboard tab.
 * Each protocol follows: RECOGNIZE → STABILIZE → EVACUATE IF
 *
 * Icons are rendered via TacticalGlyphs using the protocol `id`.
 */

export interface EmergencyProtocol {
  id: string;
  title: string;
  subtitle: string;
  accentColor: string;   // Category accent color
  badgeImage?: string;    // Shield badge illustration URL (grid cards)
  modalImage?: string;    // Realistic illustration URL (modal popup)
  recognize: string[];
  stabilize: string[];
  evacuateIf: string[];
}


// Color system per spec
export const EMERGENCY_COLORS = {
  red: '#C0392B',        // Severe Bleeding, Impalement
  orange: '#E67E22',     // Heat Stroke
  coldBlue: '#5DADE2',   // Hypothermia, Altitude Sickness
  tacticalGold: '#C48A2C', // Vehicle Roll
};

export const EMERGENCY_PROTOCOLS: EmergencyProtocol[] = [
  {
    id: 'severe-bleeding',
    title: 'Severe Bleeding',
    subtitle: 'Control life-threatening hemorrhage',
    accentColor: EMERGENCY_COLORS.red,
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773342046632_4c0901a2.png',
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330238881_f098a95a.jpg',
    recognize: [
      'Heavy steady bleeding',
      'Blood pooling or spurting',
      'Pale, weak, confused',
    ],
    stabilize: [
      'Apply firm direct pressure.',
      'Pack deep wounds if needed.',
      'Apply tourniquet if uncontrolled.',
      'Mark time applied.',
    ],
    evacuateIf: [
      'Bleeding won\'t stop',
      'Signs of shock appear',
    ],
  },
  {
    id: 'hypothermia',
    title: 'Hypothermia',
    subtitle: 'Cold exposure stabilization',
    accentColor: EMERGENCY_COLORS.coldBlue,
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773343267797_733df7d0.jpg',
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330258643_fd2cd6f8.jpg',
    recognize: [
      'Shivering',
      'Slurred speech',
      'Clumsiness',
      'Confusion',
    ],
    stabilize: [
      'Remove wet clothing.',
      'Insulate from ground.',
      'Wrap in dry layers.',
      'Warm core slowly.',
    ],
    evacuateIf: [
      'Shivering stops',
      'Person becomes drowsy',
    ],
  },
  {
    id: 'heat-stroke',
    title: 'Heat Stroke',
    subtitle: 'Critical overheating protocol',
    accentColor: EMERGENCY_COLORS.orange,
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773342116587_3881ae15.png',
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330277993_915597c8.jpg',
    recognize: [
      'Hot dry skin',
      'No sweating',
      'Confusion',
      'Rapid pulse',
    ],
    stabilize: [
      'Move to shade.',
      'Remove excess clothing.',
      'Cool neck, armpits, groin.',
      'Give fluids if alert.',
    ],
    evacuateIf: [
      'Altered awareness',
      'Vomiting or seizure',
    ],
  },
  {
    id: 'impalement',
    title: 'Impalement',
    subtitle: 'Embedded object management',
    accentColor: EMERGENCY_COLORS.red,
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773342188517_b1d68ff0.jpg',
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330305553_f418294e.jpg',
    recognize: [
      'Object embedded',
      'Bleeding around object',
    ],
    stabilize: [
      'Do NOT remove object.',
      'Stabilize with padding.',
      'Control bleeding around site.',
      'Monitor for shock.',
    ],
    evacuateIf: [
      'Heavy bleeding',
      'Breathing trouble',
    ],
  },
  {
    id: 'vehicle-roll',
    title: 'Vehicle Roll',
    subtitle: 'Overland rollover response',
    accentColor: EMERGENCY_COLORS.tacticalGold,
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773342145233_cf793d06.jpg',
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330325394_b0c2e0a8.jpg',
    recognize: [
      'Vehicle unstable',
      'Fuel leak smell',
      'Injured occupants',
    ],
    stabilize: [
      'Kill engine immediately.',
      'Check for fire risk.',
      'Stabilize occupants.',
      'Protect spine injuries.',
    ],
    evacuateIf: [
      'Fire hazard',
      'Severe trauma',
    ],
  },
  {
    id: 'altitude-sickness',
    title: 'Altitude Sickness',
    subtitle: 'Elevation illness protocol',
    accentColor: EMERGENCY_COLORS.coldBlue,
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773343292564_c3cfedda.png',
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330345852_e4e6a331.jpg',
    recognize: [
      'Headache',
      'Nausea',
      'Dizziness',
      'Fatigue at elevation',
    ],
    stabilize: [
      'Stop ascending.',
      'Hydrate.',
      'Rest.',
      'Descend if worsening.',
    ],
    evacuateIf: [
      'Confusion',
      'Trouble breathing',
    ],
  },
];



