export function shouldOpenFleetFirstVehicleSetup(input: {
  loading: boolean;
  authLoading: boolean;
  vehicleCount: number;
  profileModalVisible: boolean;
  alreadyOpened: boolean;
}): boolean {
  return (
    !input.loading &&
    !input.authLoading &&
    input.vehicleCount === 0 &&
    !input.profileModalVisible &&
    !input.alreadyOpened
  );
}
