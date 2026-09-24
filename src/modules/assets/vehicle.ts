export type AssetInput = {
  name: string;
  status: "active" | "out_of_service";
  make: string | null;
  model: string | null;
  year: number | null;
  description: string | null;
};

export type Asset = AssetInput & {
  id: string;
  organization_id: string;
  archived_at: string | null;
};

export type VehicleInput = AssetInput & {
  vin: string | null;
  plate: string | null;
  jurisdiction: string | null;
};

export type Vehicle = Asset & VehicleInput;

export function canViewVehicles(role: string | undefined) {
  return role === "owner" || role === "admin" || role === "read_only";
}

export type AssetResult<T> =
  | { status: 200 | 201; data: T; error?: never }
  | { status: 400 | 401 | 403 | 404 | 409 | 500; error: string; data?: never };

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseVehicle(input: unknown): AssetResult<VehicleInput> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { status: 400, error: "Provide vehicle details." };
  }
  const fields = [
    "name",
    "status",
    "make",
    "model",
    "year",
    "description",
    "vin",
    "plate",
    "jurisdiction",
  ];
  if (Object.keys(input).some((key) => !fields.includes(key))) {
    return { status: 400, error: "Unexpected vehicle field." };
  }
  const record = input;
  function optionalText(key: string, max: number): string | null {
    const value: unknown = Reflect.get(record, key);
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || value.includes("\0"))
      throw new Error(`${key} must be text.`);
    const normalized = value.trim();
    if (Array.from(normalized).length > max)
      throw new Error(`${key} must contain at most ${max} characters.`);
    return normalized || null;
  }
  try {
    const name = optionalText("name", 200);
    if (!name)
      return { status: 400, error: "A display name/number is required." };
    const status: unknown = Reflect.get(input, "status") ?? "active";
    if (status !== "active" && status !== "out_of_service")
      return { status: 400, error: "Invalid vehicle status." };
    const year: unknown = Reflect.get(input, "year") ?? null;
    if (
      year !== null &&
      (typeof year !== "number" ||
        !Number.isInteger(year) ||
        year < 1 ||
        year > 9999)
    ) {
      return {
        status: 400,
        error: "Year must be a whole number from 1 to 9999.",
      };
    }
    return {
      status: 200,
      data: {
        name,
        status,
        year,
        make: optionalText("make", 100),
        model: optionalText("model", 100),
        description: optionalText("description", 4000),
        vin: optionalText("vin", 100)?.toUpperCase() ?? null,
        plate: optionalText("plate", 100),
        jurisdiction: optionalText("jurisdiction", 100),
      },
    };
  } catch (error) {
    return {
      status: 400,
      error:
        error instanceof Error ? error.message : "Invalid vehicle details.",
    };
  }
}
