let vehicleDisplayRunning = false;

export function setVehicleDisplayRunning(next: boolean): void {
  vehicleDisplayRunning = next;
}

export function isVehicleDisplayRunning(): boolean {
  return vehicleDisplayRunning;
}
