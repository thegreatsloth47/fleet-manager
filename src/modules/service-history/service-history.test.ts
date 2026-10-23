import { expect, test } from "vitest";
import { costCents, parseService } from "./service-history";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const command = {
  command_id: id,
  id,
  expected_version: 0,
  action: "save",
  reason: null,
  service_date: "2020-02-29",
  title: " Oil service ",
  provider: null,
  cost_cents: null,
  currency: "USD",
  notes: null,
  total_distance: null,
  schedule_ids: [],
};
test("records unknown mileage and cost without inventing values or schedule links", () => {
  expect(parseService(command)).toEqual({
    status: 200,
    data: { ...command, title: "Oil service" },
  });
});
test.each([
  { service_date: "2021-02-29" },
  { title: " " },
  { title: "x\0" },
  { provider: 3 },
  { notes: "x".repeat(4001) },
  { total_distance: "1.01" },
  { total_distance: 100 },
  { total_distance: "-1" },
  { total_distance: "1000000000" },
  { cost_cents: -1 },
  { cost_cents: 1.1 },
  { cost_cents: 100000000000 },
  { currency: "EUR" },
  { organization_id: id },
  { schedule_ids: [id, id] },
  { schedule_ids: [null] },
  { expected_version: 1 },
  { expected_version: 2147483647 },
  { action: "delete" },
])("rejects malformed service input %j", (change) =>
  expect(parseService({ ...command, ...change }).status).toBe(400),
);
test("requires revision and reason for void; rejects replacement fields", () => {
  const voidCommand = {
    command_id: id,
    id,
    expected_version: 1,
    action: "void",
    reason: "Duplicate service",
  };
  expect(parseService(voidCommand).status).toBe(200);
  expect(parseService({ ...voidCommand, expected_version: 0 }).status).toBe(
    400,
  );
  expect(parseService({ ...voidCommand, reason: " " }).status).toBe(400);
  expect(parseService({ ...voidCommand, title: "Changed" }).status).toBe(400);
});
test("accepts precise mileage, zero cost, and multiple explicit schedules", () => {
  expect(
    parseService({
      ...command,
      total_distance: "12345.6",
      cost_cents: 0,
      schedule_ids: [id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    }).status,
  ).toBe(200);
});
test.each([
  ["", null],
  ["0", 0],
  ["1.01", 101],
  ["0.29", 29],
  ["999999999.99", 99999999999],
])("USD input %s converts exactly", (value, cents) =>
  expect(costCents(String(value))).toBe(cents),
);
test.each(["-1", "1.001", "1e2", "Infinity", "1000000000"])(
  "rejects invalid money %s",
  (value) => expect(costCents(value)).toBeNaN(),
);
