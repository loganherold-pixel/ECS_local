import type { ImageSourcePropType } from 'react-native';

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
  image?: ImageSourcePropType; // Shared Field Utilities / guide card image
  badgeImage?: string;    // Shield badge illustration URL (grid cards)
  fieldUtilityImage?: ImageSourcePropType; // Field Utilities full-card background override
  modalImage?: string;    // Realistic illustration URL (modal popup)
  beforeYouPull: string[];
  stepCards: {
    title: string;
    instruction: string;
  }[];
  doNot: string[];
  equipment: string[];
  steps: string[];
  warnings: string[];
  avoid: string[];
  completionCheck: string[];
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
    image: require('../../assets/images/safety-protocols/severe_bleeding.png'),
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773342046632_4c0901a2.png',
    fieldUtilityImage: require('../../assets/images/safety-protocols/severe_bleeding.png'),
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330238881_f098a95a.jpg',
    beforeYouPull: ['Scene safe', 'Gloves if available', 'Find bleeding source', 'Call for help', 'Expose wound'],
    stepCards: [
      { title: 'Apply pressure', instruction: 'Use firm direct pressure over the bleeding source.' },
      { title: 'Pack wound', instruction: 'Pack deep wounds with clean gauze if direct pressure is not enough.' },
      { title: 'Use tourniquet', instruction: 'Apply a tourniquet for severe limb bleeding not controlled by pressure.' },
      { title: 'Mark time', instruction: 'Record when a tourniquet or pressure dressing was applied.' },
      { title: 'Watch shock', instruction: 'Keep the person still, warm, and monitored while help is arranged.' },
      { title: 'Escalate', instruction: 'Seek urgent medical support if bleeding continues or shock signs appear.' },
    ],
    doNot: [
      'Do not remove soaked dressings; add more on top.',
      'Do not release a tourniquet once applied in the field.',
      'Do not delay urgent help for uncontrolled bleeding.',
      'Do not let the person walk if shock signs appear.',
    ],
    equipment: ['Gloves', 'Clean gauze', 'Pressure dressing', 'Tourniquet', 'Emergency blanket'],
    steps: [
      'Apply pressure.',
      'Pack wound.',
      'Use tourniquet if needed.',
      'Mark time.',
      'Watch shock.',
      'Escalate.',
    ],
    warnings: [
      'Uncontrolled bleeding can worsen quickly.',
      'Pale, confused, or weak means shock risk.',
      'Tourniquet time must be communicated to responders.',
    ],
    avoid: [
      'Do not remove soaked dressings; add more on top.',
      'Do not release a tourniquet once applied in the field.',
      'Do not delay urgent help for uncontrolled bleeding.',
      'Do not let the person walk if shock signs appear.',
    ],
    completionCheck: ['Bleeding is controlled.', 'Time applied is recorded.', 'Help or evacuation is arranged.'],
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
    beforeYouPull: ['Stop exposure', 'Move out of wind', 'Remove wet layers', 'Insulate from ground', 'Check awareness'],
    stepCards: [
      { title: 'Move sheltered', instruction: 'Get the person out of wind, rain, snow, or cold ground contact.' },
      { title: 'Remove wet layers', instruction: 'Replace wet clothing with dry layers if available.' },
      { title: 'Insulate', instruction: 'Wrap with dry layers and block heat loss from the ground.' },
      { title: 'Warm core', instruction: 'Warm the chest and trunk gradually with dry heat sources.' },
      { title: 'Monitor awareness', instruction: 'Watch speech, coordination, shivering, and alertness.' },
      { title: 'Escalate', instruction: 'Seek medical help if awareness drops or shivering stops.' },
    ],
    doNot: [
      'Do not rub arms or legs aggressively.',
      'Do not give alcohol.',
      'Do not use high heat directly on skin.',
      'Do not delay evacuation if awareness worsens.',
    ],
    equipment: ['Dry layers', 'Blanket', 'Ground insulation', 'Warm packs', 'Shelter'],
    steps: [
      'Move sheltered.',
      'Remove wet layers.',
      'Insulate.',
      'Warm core.',
      'Monitor awareness.',
      'Escalate.',
    ],
    warnings: [
      'Stopped shivering can indicate worsening condition.',
      'Confusion or drowsiness requires urgent attention.',
      'Rewarming should be gradual and focused on the core.',
    ],
    avoid: [
      'Do not rub arms or legs aggressively.',
      'Do not give alcohol.',
      'Do not use high heat directly on skin.',
      'Do not delay evacuation if awareness worsens.',
    ],
    completionCheck: ['Person is dry and insulated.', 'Core warming is underway.', 'Awareness is monitored.'],
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
    image: require('../../assets/images/safety-protocols/heat_stroke.png'),
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773342116587_3881ae15.png',
    fieldUtilityImage: require('../../assets/images/safety-protocols/heat_stroke.png'),
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330277993_915597c8.jpg',
    beforeYouPull: ['Stop activity', 'Move to shade', 'Loosen layers', 'Start cooling', 'Call for help'],
    stepCards: [
      { title: 'Move to shade', instruction: 'Stop exertion and move the person out of direct heat.' },
      { title: 'Cool fast', instruction: 'Cool neck, armpits, groin, and torso with water or cold packs.' },
      { title: 'Fan air', instruction: 'Increase airflow while cooling continues.' },
      { title: 'Give fluids', instruction: 'Offer small sips only if fully alert and able to swallow.' },
      { title: 'Monitor state', instruction: 'Watch awareness, vomiting, seizure, and breathing.' },
      { title: 'Escalate', instruction: 'Treat altered awareness as urgent and arrange medical help.' },
    ],
    doNot: [
      'Do not continue travel or exertion.',
      'Do not give fluids if not fully alert.',
      'Do not rely on rest alone when confusion is present.',
      'Do not delay urgent help for altered awareness.',
    ],
    equipment: ['Shade', 'Water', 'Cold packs', 'Fan or airflow', 'Electrolytes if alert'],
    steps: [
      'Move to shade.',
      'Cool fast.',
      'Fan air.',
      'Give fluids if alert.',
      'Monitor state.',
      'Escalate.',
    ],
    warnings: [
      'Confusion, seizure, or vomiting requires urgent help.',
      'Cooling should begin immediately.',
      'Hydration is only for someone fully alert.',
    ],
    avoid: [
      'Do not continue travel or exertion.',
      'Do not give fluids if not fully alert.',
      'Do not rely on rest alone when confusion is present.',
      'Do not delay urgent help for altered awareness.',
    ],
    completionCheck: ['Cooling is active.', 'Person is shaded and resting.', 'Help is arranged if symptoms are severe.'],
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
    image: require('../../assets/images/safety-protocols/impalement.png'),
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773342188517_b1d68ff0.jpg',
    fieldUtilityImage: require('../../assets/images/safety-protocols/impalement.png'),
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330305553_f418294e.jpg',
    beforeYouPull: ['Scene safe', 'Do not remove object', 'Control movement', 'Check bleeding', 'Call for help'],
    stepCards: [
      { title: 'Leave object', instruction: 'Keep the embedded object in place unless it blocks breathing.' },
      { title: 'Stabilize object', instruction: 'Build padding around the object to reduce movement.' },
      { title: 'Control bleeding', instruction: 'Apply pressure around the wound, not on the object.' },
      { title: 'Limit motion', instruction: 'Keep the person still and protect from further injury.' },
      { title: 'Watch shock', instruction: 'Monitor color, breathing, awareness, and weakness.' },
      { title: 'Escalate', instruction: 'Arrange urgent medical support for removal and evaluation.' },
    ],
    doNot: [
      'Do not remove the embedded object.',
      'Do not push the object deeper.',
      'Do not apply pressure directly on the object.',
      'Do not delay urgent help for heavy bleeding or breathing trouble.',
    ],
    equipment: ['Bulky dressings', 'Clean cloth', 'Tape or wrap', 'Gloves', 'Emergency blanket'],
    steps: [
      'Leave object.',
      'Stabilize object.',
      'Control bleeding.',
      'Limit motion.',
      'Watch shock.',
      'Escalate.',
    ],
    warnings: [
      'Removing the object can worsen bleeding.',
      'Breathing trouble requires urgent help.',
      'Shock signs can appear even if bleeding looks controlled.',
    ],
    avoid: [
      'Do not remove the embedded object.',
      'Do not push the object deeper.',
      'Do not apply pressure directly on the object.',
      'Do not delay urgent help for heavy bleeding or breathing trouble.',
    ],
    completionCheck: ['Object is stabilized.', 'Bleeding is monitored.', 'Urgent help is arranged.'],
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
    image: require('../../assets/images/safety-protocols/vehicle_rollover.png'),
    badgeImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773342145233_cf793d06.jpg',
    fieldUtilityImage: require('../../assets/images/safety-protocols/vehicle_rollover.png'),
    modalImage: 'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1773330325394_b0c2e0a8.jpg',
    beforeYouPull: ['Stabilize scene', 'Kill engine', 'Check fire risk', 'Account for occupants', 'Call for help'],
    stepCards: [
      { title: 'Stop hazards', instruction: 'Turn off engine, avoid sparks, and check for fuel or smoke.' },
      { title: 'Stabilize vehicle', instruction: 'Do not move the vehicle until it is stable enough to approach.' },
      { title: 'Check occupants', instruction: 'Assess breathing, bleeding, pain, and ability to move safely.' },
      { title: 'Protect spine', instruction: 'Limit movement if neck, back, or head injury is possible.' },
      { title: 'Create perimeter', instruction: 'Keep bystanders away from unstable vehicle and spill zones.' },
      { title: 'Escalate', instruction: 'Request emergency support for injury, fire risk, or entrapment.' },
    ],
    doNot: [
      'Do not crawl under an unstable vehicle.',
      'Do not move injured occupants unless immediate danger exists.',
      'Do not restart the engine after a rollover.',
      'Do not ignore fuel smell, smoke, or electrical hazards.',
    ],
    equipment: ['Fire extinguisher', 'First aid kit', 'Gloves', 'Wheel chocks', 'Warning markers'],
    steps: [
      'Stop hazards.',
      'Stabilize vehicle.',
      'Check occupants.',
      'Protect spine.',
      'Create perimeter.',
      'Escalate.',
    ],
    warnings: [
      'Vehicle instability can shift without warning.',
      'Fuel smell or smoke requires distance and urgent help.',
      'Neck or back pain should be treated cautiously.',
    ],
    avoid: [
      'Do not crawl under an unstable vehicle.',
      'Do not move injured occupants unless immediate danger exists.',
      'Do not restart the engine after a rollover.',
      'Do not ignore fuel smell, smoke, or electrical hazards.',
    ],
    completionCheck: ['Scene is controlled.', 'Occupants are accounted for.', 'Emergency support is contacted if needed.'],
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
    beforeYouPull: ['Stop ascent', 'Rest', 'Hydrate if alert', 'Check breathing', 'Plan descent'],
    stepCards: [
      { title: 'Stop ascent', instruction: 'Do not climb higher while symptoms are present.' },
      { title: 'Rest and hydrate', instruction: 'Rest and use small sips if fully alert and not vomiting.' },
      { title: 'Check symptoms', instruction: 'Watch headache, nausea, dizziness, coordination, and breathing.' },
      { title: 'Descend if worse', instruction: 'Move to lower elevation if symptoms worsen or do not improve.' },
      { title: 'Keep together', instruction: 'Do not leave the person alone or let them drive impaired.' },
      { title: 'Escalate', instruction: 'Seek urgent help for confusion, severe weakness, or breathing trouble.' },
    ],
    doNot: [
      'Do not continue ascending with symptoms.',
      'Do not let an impaired person drive.',
      'Do not ignore confusion or breathing trouble.',
      'Do not delay descent if symptoms worsen.',
    ],
    equipment: ['Water', 'Warm layers', 'Navigation to lower elevation', 'Comms device', 'First aid kit'],
    steps: [
      'Stop ascent.',
      'Rest and hydrate.',
      'Check symptoms.',
      'Descend if worse.',
      'Keep together.',
      'Escalate.',
    ],
    warnings: [
      'Confusion or breathing trouble requires urgent response.',
      'Symptoms can worsen with continued elevation gain.',
      'Descent is often the safest field action when symptoms worsen.',
    ],
    avoid: [
      'Do not continue ascending with symptoms.',
      'Do not let an impaired person drive.',
      'Do not ignore confusion or breathing trouble.',
      'Do not delay descent if symptoms worsen.',
    ],
    completionCheck: ['Ascent is paused.', 'Symptoms are monitored.', 'Descent or support plan is ready.'],
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



