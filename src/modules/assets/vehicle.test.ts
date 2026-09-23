import { expect, test } from "vitest";
import { parseVehicle } from "./vehicle";

test("only the display name is required; optional blanks become null", () => {
  expect(parseVehicle({ name: "  Van 1  ", make: "  " }).data).toEqual({
    name: "Van 1",
    status: "active",
    make: null,
    model: null,
    year: null,
    description: null,
    vin: null,
    plate: null,
    jurisdiction: null,
  });
});

test("normalizes VIN and preserves all vehicle details", () => {
  expect(
    parseVehicle({
      name: "Truck",
      vin: " abc123 ",
      status: "out_of_service",
      year: 2024,
      plate: " ABC ",
      jurisdiction: " MO ",
      make: "Ford",
      model: "F-150",
      description: "Work truck",
    }).data,
  ).toEqual({
    name: "Truck",
    vin: "ABC123",
    status: "out_of_service",
    year: 2024,
    plate: "ABC",
    jurisdiction: "MO",
    make: "Ford",
    model: "F-150",
    description: "Work truck",
  });
});

test.each([
  null,
  [],
  "vehicle",
  {},
  { name: " " },
  { name: 1 },
  { name: "x".repeat(201) },
  { name: "A", status: "archived" },
  { name: "A", year: "2024" },
  { name: "A", year: 2024.5 },
  { name: "A", year: 10000 },
  { name: "A", year: 0 },
  { name: "A", vin: {} },
  { name: "A", description: "x".repeat(4001) },
  { name: "A", plate: "\0" },
  { name: "A", organization_id: "foreign" },
  { name: "A", archived_at: null },
  { name: "A", asset_type: "equipment" },
])("rejects invalid or privileged fields: %j", (input) => {
  expect(parseVehicle(input).status).toBe(400);
});
