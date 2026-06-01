import type { ImageSourcePropType } from 'react-native';

import { EMERGENCY_COLORS, type EmergencyProtocol } from './EmergencyData';

export type ProtocolDefinition = EmergencyProtocol & {
  image?: ImageSourcePropType;
};

export type RecoveryProtocol = ProtocolDefinition & {
  image: ImageSourcePropType;
  fieldUtilityImage: ImageSourcePropType;
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
};

const RECOVERY_ACCENT = EMERGENCY_COLORS.tacticalGold;

export const RECOVERY_PROTOCOLS: RecoveryProtocol[] = [
  {
    id: 'winch-recovery',
    title: 'Winch Recovery',
    subtitle: 'Fixed-anchor self-recovery',
    accentColor: RECOVERY_ACCENT,
    image: require('../../assets/images/protocols/recovery/recovery_winch.png'),
    fieldUtilityImage: require('../../assets/images/protocols/recovery/recovery_winch.png'),
    badgeImage: 'local:winch-recovery',
    beforeYouPull: ['Inspect anchor', 'Use rated point', 'Clear line path', 'Use line damper', 'Agree signals'],
    stepCards: [
      { title: 'Choose anchor', instruction: 'Select a strong tree, rock, or fixed recovery point.' },
      { title: 'Protect anchor', instruction: 'Wrap a tree saver low and even around the anchor.' },
      { title: 'Connect line', instruction: 'Attach winch line with rated shackle or soft shackle.' },
      { title: 'Tension slowly', instruction: 'Remove slack before applying pull.' },
      { title: 'Drive lightly', instruction: 'Assist with gentle throttle only when directed.' },
      { title: 'Secure vehicle', instruction: 'Stop once stable and reset gear.' },
    ],
    doNot: [
      'Do not stand near a loaded line.',
      'Do not hook cable back onto itself.',
      'Do not use unrated tie-down points.',
      'Do not shock-load the winch.',
    ],
    equipment: ['Winch line', 'Rated anchor', 'Tree saver', 'Line damper', 'Rated shackle'],
    steps: [
      'Choose anchor.',
      'Protect anchor.',
      'Connect line.',
      'Tension slowly.',
      'Drive lightly.',
      'Secure vehicle.',
    ],
    warnings: [
      'Do not stand near a loaded line.',
      'Do not hook cable back onto itself.',
      'Do not use unrated tie-down points.',
      'Do not shock-load the winch.',
    ],
    avoid: [
      'Do not stand near a loaded line.',
      'Do not hook cable back onto itself.',
      'Do not use unrated tie-down points.',
      'Do not shock-load the winch.',
    ],
    completionCheck: ['Vehicle is stable.', 'Line and shackles are inspected.', 'Anchor strap is recovered.'],
    recognize: ['Inspect anchor.', 'Use rated point.', 'Clear line path.'],
    stabilize: [
      'Select a strong tree, rock, or fixed recovery point.',
      'Wrap a tree saver low and even around the anchor.',
      'Attach winch line with rated shackle or soft shackle.',
      'Remove slack before applying pull.',
      'Assist with gentle throttle only when directed.',
      'Stop once stable and reset gear.',
    ],
    evacuateIf: [
      'Do not stand near a loaded line.',
      'Do not hook cable back onto itself.',
      'Do not use unrated tie-down points.',
      'Do not shock-load the winch.',
    ],
  },
  {
    id: 'vehicle-assisted-pull',
    title: 'Vehicle-Assisted Pull',
    subtitle: 'Recover using a second vehicle',
    accentColor: RECOVERY_ACCENT,
    image: require('../../assets/images/protocols/recovery/recovery_vehicle_assisted_pull.png'),
    fieldUtilityImage: require('../../assets/images/protocols/recovery/recovery_vehicle_assisted_pull.png'),
    badgeImage: 'local:vehicle-assisted-pull',
    beforeYouPull: ['Confirm rated points', 'Align vehicles', 'Clear bystanders', 'Agree hand signals', 'Use recovery strap'],
    stepCards: [
      { title: 'Position recovery vehicle', instruction: 'Align with the safest pull direction.' },
      { title: 'Attach strap', instruction: 'Connect only to rated recovery points.' },
      { title: 'Remove slack', instruction: 'Pull forward until the strap is lightly tensioned.' },
      { title: 'Pull smoothly', instruction: 'Apply steady throttle without jerking.' },
      { title: 'Guide steering', instruction: 'Stuck vehicle steers with the recovery path.' },
      { title: 'Stop and reset', instruction: 'Stop once free and disconnect under no load.' },
    ],
    doNot: [
      'Do not use trailer balls.',
      'Do not stand between vehicles.',
      'Do not exceed strap rating.',
      'Do not pull sideways on weak points.',
    ],
    equipment: ['Recovery vehicle', 'Recovery strap', 'Rated recovery points', 'Rated shackles', 'Spotter'],
    steps: [
      'Position recovery vehicle.',
      'Attach strap.',
      'Remove slack.',
      'Pull smoothly.',
      'Guide steering.',
      'Stop and reset.',
    ],
    warnings: [
      'Do not use trailer balls.',
      'Do not stand between vehicles.',
      'Do not exceed strap rating.',
      'Do not pull sideways on weak points.',
    ],
    avoid: [
      'Do not use trailer balls.',
      'Do not stand between vehicles.',
      'Do not exceed strap rating.',
      'Do not pull sideways on weak points.',
    ],
    completionCheck: ['Both vehicles are stable.', 'Strap and points are inspected.', 'Route forward is clear.'],
    recognize: ['Confirm rated points.', 'Align vehicles.', 'Clear bystanders.'],
    stabilize: [
      'Align with the safest pull direction.',
      'Connect only to rated recovery points.',
      'Pull forward until the strap is lightly tensioned.',
      'Apply steady throttle without jerking.',
      'Stuck vehicle steers with the recovery path.',
      'Stop once free and disconnect under no load.',
    ],
    evacuateIf: [
      'Do not use trailer balls.',
      'Do not stand between vehicles.',
      'Do not exceed strap rating.',
      'Do not pull sideways on weak points.',
    ],
  },
  {
    id: 'deadman-anchor-recovery',
    title: 'Deadman Anchor Recovery',
    subtitle: 'Winch without a tree or fixed anchor',
    accentColor: RECOVERY_ACCENT,
    image: require('../../assets/images/protocols/recovery/recovery_deadman_anchor.png'),
    fieldUtilityImage: require('../../assets/images/protocols/recovery/recovery_deadman_anchor.png'),
    badgeImage: 'local:deadman-anchor-recovery',
    beforeYouPull: ['Choose firm ground', 'Dig anchor trench', 'Use rated gear', 'Clear line path', 'Mark anchor zone'],
    stepCards: [
      { title: 'Build anchor', instruction: 'Bury a spare tire, ground anchor, or rated land anchor.' },
      { title: 'Angle the trench', instruction: 'Set the anchor against the pull direction.' },
      { title: 'Attach line', instruction: 'Connect the winch line to the anchor with rated hardware.' },
      { title: 'Pack and test', instruction: 'Backfill, compact, and apply light tension.' },
      { title: 'Pull slowly', instruction: 'Winch in short controlled movements.' },
      { title: 'Recheck anchor', instruction: 'Stop if the anchor shifts or rises.' },
    ],
    doNot: [
      'Do not use shallow anchors.',
      'Do not stand over the buried anchor.',
      'Do not pull if the anchor creeps.',
      'Do not use unknown metal scraps.',
    ],
    equipment: ['Shovel', 'Spare tire or ground anchor', 'Winch line', 'Rated hardware', 'Marker'],
    steps: [
      'Build anchor.',
      'Angle the trench.',
      'Attach line.',
      'Pack and test.',
      'Pull slowly.',
      'Recheck anchor.',
    ],
    warnings: [
      'Do not use shallow anchors.',
      'Do not stand over the buried anchor.',
      'Do not pull if the anchor creeps.',
      'Do not use unknown metal scraps.',
    ],
    avoid: [
      'Do not use shallow anchors.',
      'Do not stand over the buried anchor.',
      'Do not pull if the anchor creeps.',
      'Do not use unknown metal scraps.',
    ],
    completionCheck: ['Vehicle is free and stable.', 'Anchor gear is recovered.', 'Area is filled and safe.'],
    recognize: ['Choose firm ground.', 'Dig anchor trench.', 'Mark anchor zone.'],
    stabilize: [
      'Bury a spare tire, ground anchor, or rated land anchor.',
      'Set the anchor against the pull direction.',
      'Connect the winch line to the anchor with rated hardware.',
      'Backfill, compact, and apply light tension.',
      'Winch in short controlled movements.',
      'Stop if the anchor shifts or rises.',
    ],
    evacuateIf: [
      'Do not use shallow anchors.',
      'Do not stand over the buried anchor.',
      'Do not pull if the anchor creeps.',
      'Do not use unknown metal scraps.',
    ],
  },
  {
    id: 'snatch-block-redirect',
    title: 'Snatch Block Redirect',
    subtitle: 'Redirect pull angle or increase force',
    accentColor: RECOVERY_ACCENT,
    image: require('../../assets/images/protocols/recovery/recovery_snatch_block_redirect.png'),
    fieldUtilityImage: require('../../assets/images/protocols/recovery/recovery_snatch_block_redirect.png'),
    badgeImage: 'local:snatch-block-redirect',
    beforeYouPull: ['Identify pull angle', 'Use rated pulley', 'Use tree saver', 'Clear triangle zone', 'Confirm line path'],
    stepCards: [
      { title: 'Set anchor', instruction: 'Place the tree saver or anchor strap at the redirect point.' },
      { title: 'Mount pulley', instruction: 'Attach the snatch block with rated hardware.' },
      { title: 'Route line', instruction: 'Feed the winch line through the pulley cleanly.' },
      { title: 'Connect return', instruction: 'Run the line back to the vehicle or recovery point.' },
      { title: 'Tension slowly', instruction: 'Watch both line legs for clean tracking.' },
      { title: 'Pull in stages', instruction: 'Stop often and inspect the pulley and anchor.' },
    ],
    doNot: [
      'Do not stand inside the line triangle.',
      'Do not cross or twist cable legs.',
      'Do not side-load weak hardware.',
      'Do not exceed gear ratings.',
    ],
    equipment: ['Snatch block', 'Tree saver', 'Winch line', 'Rated hardware', 'Line damper'],
    steps: [
      'Set anchor.',
      'Mount pulley.',
      'Route line.',
      'Connect return.',
      'Tension slowly.',
      'Pull in stages.',
    ],
    warnings: [
      'Do not stand inside the line triangle.',
      'Do not cross or twist cable legs.',
      'Do not side-load weak hardware.',
      'Do not exceed gear ratings.',
    ],
    avoid: [
      'Do not stand inside the line triangle.',
      'Do not cross or twist cable legs.',
      'Do not side-load weak hardware.',
      'Do not exceed gear ratings.',
    ],
    completionCheck: ['Pulley moved freely.', 'Anchor stayed stable.', 'Line is cleanly rewound.'],
    recognize: ['Identify pull angle.', 'Clear triangle zone.', 'Confirm line path.'],
    stabilize: [
      'Place the tree saver or anchor strap at the redirect point.',
      'Attach the snatch block with rated hardware.',
      'Feed the winch line through the pulley cleanly.',
      'Run the line back to the vehicle or recovery point.',
      'Watch both line legs for clean tracking.',
      'Stop often and inspect the pulley and anchor.',
    ],
    evacuateIf: [
      'Do not stand inside the line triangle.',
      'Do not cross or twist cable legs.',
      'Do not side-load weak hardware.',
      'Do not exceed gear ratings.',
    ],
  },
  {
    id: 'kinetic-rope-recovery',
    title: 'Kinetic Rope Recovery',
    subtitle: 'Momentum-assisted soft-terrain extraction',
    accentColor: RECOVERY_ACCENT,
    image: require('../../assets/images/protocols/recovery/recovery_kinetic_rope.png'),
    fieldUtilityImage: require('../../assets/images/protocols/recovery/recovery_kinetic_rope.png'),
    badgeImage: 'local:kinetic-rope-recovery',
    beforeYouPull: ['Use kinetic rope', 'Confirm rated points', 'Clear bystanders', 'Agree signal', 'Check terrain path'],
    stepCards: [
      { title: 'Attach rope', instruction: 'Connect both ends to rated recovery points.' },
      { title: 'Set slack', instruction: 'Leave controlled slack for rope stretch.' },
      { title: 'Plan path', instruction: 'Recovery vehicle drives straight and clear.' },
      { title: 'Pull with momentum', instruction: 'Apply controlled acceleration, not a hard launch.' },
      { title: 'Recover in cycles', instruction: 'Repeat only if gear and points remain stable.' },
      { title: 'Stop once free', instruction: 'Disconnect only after tension is removed.' },
    ],
    doNot: [
      'Do not use a static strap as kinetic rope.',
      'Do not attach to trailer balls.',
      'Do not let anyone stand near the rope.',
      'Do not use damaged rope.',
    ],
    equipment: ['Kinetic rope', 'Rated recovery points', 'Soft shackles', 'Spotter', 'Radio or hand signal'],
    steps: [
      'Attach rope.',
      'Set slack.',
      'Plan path.',
      'Pull with momentum.',
      'Recover in cycles.',
      'Stop once free.',
    ],
    warnings: [
      'Do not use a static strap as kinetic rope.',
      'Do not attach to trailer balls.',
      'Do not let anyone stand near the rope.',
      'Do not use damaged rope.',
    ],
    avoid: [
      'Do not use a static strap as kinetic rope.',
      'Do not attach to trailer balls.',
      'Do not let anyone stand near the rope.',
      'Do not use damaged rope.',
    ],
    completionCheck: ['Vehicles are clear of soft terrain.', 'Rope has no cuts or burns.', 'Recovery points are undamaged.'],
    recognize: ['Use kinetic rope.', 'Confirm rated points.', 'Check terrain path.'],
    stabilize: [
      'Connect both ends to rated recovery points.',
      'Leave controlled slack for rope stretch.',
      'Recovery vehicle drives straight and clear.',
      'Apply controlled acceleration, not a hard launch.',
      'Repeat only if gear and points remain stable.',
      'Disconnect only after tension is removed.',
    ],
    evacuateIf: [
      'Do not use a static strap as kinetic rope.',
      'Do not attach to trailer balls.',
      'Do not let anyone stand near the rope.',
      'Do not use damaged rope.',
    ],
  },
  {
    id: 'multi-vehicle-recovery',
    title: 'Multi-Vehicle Recovery',
    subtitle: 'Coordinated extraction with multiple rigs',
    accentColor: RECOVERY_ACCENT,
    image: require('../../assets/images/protocols/recovery/recovery_multi_vehicle.png'),
    fieldUtilityImage: require('../../assets/images/protocols/recovery/recovery_multi_vehicle.png'),
    badgeImage: 'local:multi-vehicle-recovery',
    beforeYouPull: ['Assign lead', 'Set radio channel', 'Stage vehicles', 'Clear bystanders', 'Confirm ratings'],
    stepCards: [
      { title: 'Assign recovery lead', instruction: 'One person controls timing and commands.' },
      { title: 'Stage vehicles', instruction: 'Position each rig for a clean pull direction.' },
      { title: 'Connect gear', instruction: 'Use rated points, straps, shackles, and dampers.' },
      { title: 'Communicate countdown', instruction: 'Pull only on the lead command.' },
      { title: 'Pull in sequence', instruction: 'Apply slow coordinated tension.' },
      { title: 'Stop and reassess', instruction: 'Reset if the stuck vehicle changes angle.' },
    ],
    doNot: [
      'Do not let multiple drivers improvise.',
      'Do not cross loaded lines.',
      'Do not pull from unsafe angles.',
      'Do not exceed the lowest gear rating.',
    ],
    equipment: ['Multiple rigs', 'Rated straps or lines', 'Shackles', 'Line dampers', 'Radios'],
    steps: [
      'Assign recovery lead.',
      'Stage vehicles.',
      'Connect gear.',
      'Communicate countdown.',
      'Pull in sequence.',
      'Stop and reassess.',
    ],
    warnings: [
      'Do not let multiple drivers improvise.',
      'Do not cross loaded lines.',
      'Do not pull from unsafe angles.',
      'Do not exceed the lowest gear rating.',
    ],
    avoid: [
      'Do not let multiple drivers improvise.',
      'Do not cross loaded lines.',
      'Do not pull from unsafe angles.',
      'Do not exceed the lowest gear rating.',
    ],
    completionCheck: ['All vehicles are stable.', 'Gear is accounted for.', 'Trail is clear before departure.'],
    recognize: ['Assign lead.', 'Set radio channel.', 'Confirm ratings.'],
    stabilize: [
      'One person controls timing and commands.',
      'Position each rig for a clean pull direction.',
      'Use rated points, straps, shackles, and dampers.',
      'Pull only on the lead command.',
      'Apply slow coordinated tension.',
      'Reset if the stuck vehicle changes angle.',
    ],
    evacuateIf: [
      'Do not let multiple drivers improvise.',
      'Do not cross loaded lines.',
      'Do not pull from unsafe angles.',
      'Do not exceed the lowest gear rating.',
    ],
  },
];

export function isRecoveryProtocol(protocol: ProtocolDefinition | null): protocol is RecoveryProtocol {
  return Boolean(protocol && 'stepCards' in protocol && Array.isArray((protocol as RecoveryProtocol).stepCards));
}
