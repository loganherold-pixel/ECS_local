import type { ImageSourcePropType } from 'react-native';

declare const require: (path: string) => ImageSourcePropType;

export type VehicleAttitudeAssetManifestEntry = {
  vehicleId: string;
  label: string;
  attitudeImageSrc: string;
  attitudeImageSource: ImageSourcePropType;
  sourceFilename: string;
};

export const VEHICLE_ATTITUDE_ASSET_MANIFEST = {
  chevy_colorado: {
    vehicleId: 'chevy_colorado',
    label: 'Chevy Colorado',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Chevy_Colorado.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Chevy_Colorado.png'),
    sourceFilename: 'Chevy_Colorado.png',
  },
  ford_bronco: {
    vehicleId: 'ford_bronco',
    label: 'Ford Bronco',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Ford_Bronco.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Ford_Bronco.png'),
    sourceFilename: 'Ford_Bronco.png',
  },
  ford_f150: {
    vehicleId: 'ford_f150',
    label: 'Ford F-150',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Ford_F150.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Ford_F150.png'),
    sourceFilename: 'Ford_F150.png',
  },
  ford_super_duty: {
    vehicleId: 'ford_super_duty',
    label: 'Ford Super Duty',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Ford_Super_Duty.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Ford_Super_Duty.png'),
    sourceFilename: 'Ford_Super_Duty.png',
  },
  generic_pickup: {
    vehicleId: 'generic_pickup',
    label: 'Generic Pickup',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Generic_Pickup.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Generic_Pickup.png'),
    sourceFilename: 'Generic_Pickup.png',
  },
  generic_suv: {
    vehicleId: 'generic_suv',
    label: 'Generic SUV',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Generic_SUV.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Generic_SUV.png'),
    sourceFilename: 'Generic_SUV.png',
  },
  generic_van: {
    vehicleId: 'generic_van',
    label: 'Generic Van',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Generic_Van.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Generic_Van.png'),
    sourceFilename: 'Generic_Van.png',
  },
  jeep_gladiator: {
    vehicleId: 'jeep_gladiator',
    label: 'Jeep Gladiator',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Jeep_Gladiator.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Jeep_Gladiator.png'),
    sourceFilename: 'Jeep_Gladiator.png',
  },
  jeep_wrangler: {
    vehicleId: 'jeep_wrangler',
    label: 'Jeep Wrangler',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Jeep_Wrangler.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Jeep_Wrangler.png'),
    sourceFilename: 'Jeep_Wrangler.png',
  },
  lexus_lx: {
    vehicleId: 'lexus_lx',
    label: 'Lexus LX',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Lexus_Lx.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Lexus_Lx.png'),
    sourceFilename: 'Lexus_Lx.png',
  },
  mercedes_benz_sprinter: {
    vehicleId: 'mercedes_benz_sprinter',
    label: 'Mercedes Sprinter',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Mercedes_Sprinter.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Mercedes_Sprinter.png'),
    sourceFilename: 'Mercedes_Sprinter.png',
  },
  nissan_xterra: {
    vehicleId: 'nissan_xterra',
    label: 'Nissan Xterra',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Nissan_Xterra.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Nissan_Xterra.png'),
    sourceFilename: 'Nissan_Xterra.png',
  },
  nissan_frontier: {
    vehicleId: 'nissan_frontier',
    label: 'Nissan Frontier',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Nissan_Frontier.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Nissan_Frontier.png'),
    sourceFilename: 'Nissan_Frontier.png',
  },
  ram_1500: {
    vehicleId: 'ram_1500',
    label: 'Ram 1500',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Ram_1500.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Ram_1500.png'),
    sourceFilename: 'Ram_1500.png',
  },
  ram_2500_3500: {
    vehicleId: 'ram_2500_3500',
    label: 'Ram 2500/3500',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Ram_2500_3500.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Ram_2500_3500.png'),
    sourceFilename: 'Ram_2500_3500.png',
  },
  subaru_outback: {
    vehicleId: 'subaru_outback',
    label: 'Subaru Outback',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Subaru_Outback.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Subaru_Outback.png'),
    sourceFilename: 'Subaru_Outback.png',
  },
  toyota_4runner: {
    vehicleId: 'toyota_4runner',
    label: 'Toyota 4Runner',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Toyota_4Runner.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Toyota_4Runner.png'),
    sourceFilename: 'Toyota_4Runner.png',
  },
  toyota_land_cruiser: {
    vehicleId: 'toyota_land_cruiser',
    label: 'Toyota Land Cruiser',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Toyota_Landcruiser.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Toyota_Landcruiser.png'),
    sourceFilename: 'Toyota_Landcruiser.png',
  },
  toyota_sequoia: {
    vehicleId: 'toyota_sequoia',
    label: 'Toyota Sequoia',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Toyota_Sequoia.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Toyota_Sequoia.png'),
    sourceFilename: 'Toyota_Sequoia.png',
  },
  toyota_tacoma: {
    vehicleId: 'toyota_tacoma',
    label: 'Toyota Tacoma',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Toyota_Tacoma.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Toyota_Tacoma.png'),
    sourceFilename: 'Toyota_Tacoma.png',
  },
  toyota_tundra: {
    vehicleId: 'toyota_tundra',
    label: 'Toyota Tundra',
    attitudeImageSrc: 'assets/vehicles/attitude/clean/Toyota_Tundra.png',
    attitudeImageSource: require('../../../assets/vehicles/attitude/clean/Toyota_Tundra.png'),
    sourceFilename: 'Toyota_Tundra.png',
  },
} as const satisfies Record<string, VehicleAttitudeAssetManifestEntry>;

export type VehicleAttitudeId = keyof typeof VEHICLE_ATTITUDE_ASSET_MANIFEST;

export const VEHICLE_ATTITUDE_ASSET_COUNT = Object.keys(
  VEHICLE_ATTITUDE_ASSET_MANIFEST,
).length;

export const VEHICLE_ATTITUDE_ASSET_MANIFEST_COUNT = VEHICLE_ATTITUDE_ASSET_COUNT;

const EXPECTED_VEHICLE_ATTITUDE_ASSET_COUNT = 21;

if (
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  VEHICLE_ATTITUDE_ASSET_COUNT !== EXPECTED_VEHICLE_ATTITUDE_ASSET_COUNT
) {
  console.warn(
    `[ECS attitude assets] Expected ${EXPECTED_VEHICLE_ATTITUDE_ASSET_COUNT} vehicle attitude assets, found ${VEHICLE_ATTITUDE_ASSET_COUNT}.`,
  );
}
