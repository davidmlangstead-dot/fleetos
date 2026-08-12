export type VehicleType = "TRUCK" | "VAN" | "TRAILER" | "CAR" | "OTHER";

export const VEHICLE_TYPES: Array<{ value: VehicleType; label: string; description: string }> = [
  { value: "TRUCK", label: "HGV / Truck", description: "Heavy goods vehicle and rigid/tractor units." },
  { value: "VAN", label: "Van / Non-HGV", description: "Light commercial vehicle below HGV threshold." },
  { value: "TRAILER", label: "Trailer", description: "Trailer or semi-trailer recorded separately." },
  { value: "CAR", label: "Car", description: "Passenger or pool vehicle." },
  { value: "OTHER", label: "Other", description: "Anything that does not fit the standard types." },
];

export function requiresTachoCalibration(type: VehicleType) {
  return type === "TRUCK";
}

export function requiredVehicleFields(type: VehicleType) {
  const base = ["registration", "type", "firstRegisteredAt", "acquiredAt"];
  if (type === "TRUCK") return [...base, "make", "model", "grossWeightKg", "vin"];
  if (type === "VAN") return [...base, "make", "model"];
  if (type === "TRAILER") return [...base, "make", "model", "vin"];
  return base;
}

export function validateDateOrder(firstRegisteredAt: string, acquiredAt: string) {
  if (!firstRegisteredAt || !acquiredAt) return null;
  if (acquiredAt < firstRegisteredAt) return "Acquired date cannot be before first registration date.";
  return null;
}
