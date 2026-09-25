import { expect, test } from "vitest";
import {
  defaultRule,
  maintenanceState,
  organizationDate,
  parseMaintenance,
  shiftCalendar,
  type Assignment,
} from "./maintenance";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const schedule: Assignment = {
  ...defaultRule,
  name: "Oil",
  distance_interval: 1000,
  distance_unit: "mi",
  id,
  organization_id: id,
  asset_id: id,
  asset_type: "vehicle",
  template_id: id,
  meter_id: id,
  next_due_usage: 10000,
  next_due_date: null,
  paused: false,
  version: 1,
  updated_by: id,
  updated_at: "2026-01-01",
};
test.each([
  ["9899.9", "Not due"],
  ["9900", "Upcoming"],
  ["9949.9", "Upcoming"],
  ["9950", "Due"],
  ["9999.9", "Due"],
  ["10000", "Due"],
  ["10000.1", "Overdue"],
])("distance boundary at %s is %s", (usage, status) => {
  expect(maintenanceState(schedule, usage, "2026-01-01").status).toBe(status);
});
test("exact decimal tenths and custom windows do not drift", () => {
  const rule = {
    ...schedule,
    distance_interval: 1,
    next_due_usage: 0.3,
    upcoming_percent: 20,
    due_percent: 10,
  };
  expect(maintenanceState(rule, "0.1", "2026-01-01").status).toBe("Upcoming");
  expect(maintenanceState(rule, "0.2", "2026-01-01").status).toBe("Due");
  expect(maintenanceState(rule, "0.4", "2026-01-01").remainingUsage).toBe(-0.1);
});
test.each([
  ["2026-04-25", "Not due"],
  ["2026-04-27", "Upcoming"],
  ["2026-04-28", "Due"],
  ["2026-04-30", "Due"],
  ["2026-05-01", "Overdue"],
])(
  "month windows use calendar days, round up, and include target: %s",
  (today, status) => {
    expect(
      maintenanceState(
        {
          ...schedule,
          distance_interval: null,
          distance_unit: null,
          next_due_usage: null,
          time_interval: 1,
          time_unit: "months",
          next_due_date: "2026-04-30",
        },
        null,
        today,
      ).status,
    ).toBe(status);
  },
);
test.each([
  ["2024-01-31", 1, "months", "2024-02-29"],
  ["2024-02-29", 1, "years", "2025-02-28"],
  ["2026-03-31", -1, "months", "2026-02-28"],
  ["2026-03-07", 1, "days", "2026-03-08"],
  ["2026-12-28", 1, "weeks", "2027-01-04"],
] as const)(
  "calendar arithmetic clamps month ends: %s",
  (date, count, unit, expected) => {
    expect(shiftCalendar(date, count, unit)).toBe(expected);
  },
);
test("combined rules take the more urgent status and time-only works without a meter", () => {
  const both = {
    ...schedule,
    time_interval: 100,
    time_unit: "days" as const,
    next_due_date: "2026-06-01",
  };
  expect(maintenanceState(both, "9000", "2026-06-02").status).toBe("Overdue");
  expect(maintenanceState(both, "10001", "2026-01-01").status).toBe("Overdue");
  expect(maintenanceState(both, "9950", "2026-05-25").status).toBe("Due");
  expect(maintenanceState(both, null, "2026-06-02")).toMatchObject({
    status: "Overdue",
    missingUsage: true,
  });
  expect(
    maintenanceState(
      { ...both, distance_interval: null, next_due_usage: null },
      null,
      "2026-06-02",
    ).missingUsage,
  ).toBe(false);
});
test("organization date is independent of server timezone, including DST", () => {
  expect(
    organizationDate(new Date("2026-03-08T05:30:00Z"), "America/Chicago"),
  ).toBe("2026-03-07");
  expect(
    organizationDate(new Date("2026-03-09T05:30:00Z"), "America/Chicago"),
  ).toBe("2026-03-09");
});
const template = {
  ...defaultRule,
  id,
  expected_version: 0,
  name: "Oil",
  distance_interval: 1000,
  distance_unit: "mi",
  enabled: true,
};
test("valid distance, calendar, and combined definitions", () => {
  expect(parseMaintenance(template, false).status).toBe(200);
  expect(
    parseMaintenance(
      {
        ...template,
        distance_interval: null,
        distance_unit: null,
        time_interval: 6,
        time_unit: "months",
      },
      false,
    ).status,
  ).toBe(200);
  expect(
    parseMaintenance(
      { ...template, time_interval: 1, time_unit: "years" },
      false,
    ).status,
  ).toBe(200);
});
test.each([
  { distance_interval: null, distance_unit: null },
  { distance_interval: 0 },
  { distance_interval: 1.01 },
  { distance_interval: "1000" },
  { distance_unit: "hours" },
  { time_interval: 1, time_unit: null },
  { time_interval: 1.2, time_unit: "months" },
  { due_percent: 11 },
  { due_percent: -1 },
  { upcoming_percent: 101 },
  { upcoming_percent: NaN },
  { id: "foreign" },
  { expected_version: -1 },
  { expected_version: 1.5 },
  { organization_id: id },
  { enabled: "true" },
  { name: " " },
])("rejects malformed definitions %#", (changes) => {
  expect(parseMaintenance({ ...template, ...changes }, false).status).toBe(400);
});
const definition = {
  ...defaultRule,
  id,
  expected_version: 0,
  name: "Oil",
  distance_interval: 1000,
  distance_unit: "mi",
};
const assignment = {
  ...definition,
  template_id: id,
  next_due_usage: 100,
  next_due_date: null,
  paused: false,
};
test("explicit targets can already be overdue; targets must match interval dimensions", () => {
  expect(parseMaintenance(assignment, true).status).toBe(200);
  expect(
    parseMaintenance({ ...assignment, next_due_usage: null }, true).status,
  ).toBe(400);
  expect(
    parseMaintenance({ ...assignment, next_due_date: "2026-01-01" }, true)
      .status,
  ).toBe(400);
  expect(
    parseMaintenance(
      {
        ...assignment,
        time_interval: 1,
        time_unit: "months",
        next_due_date: "2026-02-30",
      },
      true,
    ).status,
  ).toBe(400);
  expect(
    parseMaintenance(
      {
        ...assignment,
        time_interval: 1,
        time_unit: "months",
        next_due_date: "2024-02-29",
      },
      true,
    ).status,
  ).toBe(200);
});
