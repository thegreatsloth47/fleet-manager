import { expect, test } from "vitest";
import { auditLines, parseMeterCommand } from "./meter";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reading = {
  command_id: id,
  action: "reading",
  observed_at: "2020-01-02T12:00:00Z",
  physical: "125.1",
};

test("validates baseline, reading, replacement, correction and void commands", () => {
  for (const input of [
    reading,
    { ...reading, action: "baseline", unit: "km", baseline_usage: "125.1" },
    {
      ...reading,
      action: "baseline",
      unit: "mi",
      baseline_usage: "200",
      reason: "Previous replacement",
    },
    {
      ...reading,
      action: "replacement",
      old_final: "90000",
      reason: "Broken odometer",
    },
    {
      command_id: id,
      action: "correct",
      entry_id: id,
      expected_revision_id: id,
      physical: "120",
      reason: "Typo",
    },
    {
      command_id: id,
      action: "void",
      entry_id: id,
      expected_revision_id: id,
      reason: "Wrong vehicle",
    },
  ])
    expect(parseMeterCommand(input).status).toBe(200);
});

test.each([
  null,
  [],
  {},
  { ...reading, command_id: "bad" },
  { ...reading, action: "hours" },
  { ...reading, organization_id: id },
  { ...reading, actor_id: id },
  { ...reading, source: "obd" },
  { ...reading, physical: 125 },
  { ...reading, physical: "-1" },
  { ...reading, physical: "1.01" },
  { ...reading, physical: "NaN" },
  { ...reading, physical: "Infinity" },
  { ...reading, physical: "1e3" },
  { ...reading, physical: "1000000000" },
  { ...reading, physical: "" },
  { ...reading, observed_at: "2999-01-01T00:00:00Z" },
  { ...reading, observed_at: "invalid" },
  { ...reading, observed_at: "2020-01-01T00:00:00" },
  { ...reading, observed_at: "2020-01-01" },
  { ...reading, unit: "mi" },
  { ...reading, baseline_usage: "100" },
  { ...reading, old_final: "100" },
  { ...reading, entry_id: id },
  { ...reading, reason: " " },
  { ...reading, reason: "\0" },
  { ...reading, reason: "x".repeat(2001) },
  { ...reading, action: "baseline", unit: "mi" },
  { ...reading, action: "baseline", unit: "hours", baseline_usage: "125.1" },
  { ...reading, action: "baseline", unit: "mi", baseline_usage: "120" },
  { ...reading, action: "baseline", unit: "mi", baseline_usage: "200" },
  { ...reading, action: "replacement", old_final: "120" },
  { ...reading, action: "replacement", reason: "Broken" },
  {
    command_id: id,
    action: "correct",
    entry_id: id,
    physical: "1",
    reason: "Typo",
  },
  {
    command_id: id,
    action: "correct",
    entry_id: id,
    expected_revision_id: id,
    physical: "1",
  },
  {
    command_id: id,
    action: "void",
    entry_id: id,
    expected_revision_id: id,
    reason: "Wrong vehicle",
    physical: "1",
  },
])("rejects invalid input: %j", (input) =>
  expect(parseMeterCommand(input).status).toBe(400),
);

test("retains exact decimal strings and trims explanations", () => {
  expect(
    parseMeterCommand({ ...reading, physical: "0.1", reason: "  Checked  " })
      .data,
  ).toMatchObject({ physical: "0.1", reason: "Checked" });
});

test("audit presents original evidence and every correction and void", () => {
  const lines = auditLines(
    JSON.stringify({
      original: { physical: "100", actor: id, reason: "Initial" },
      revisions: [
        { physical: "110", reason: "Typo", voided: false },
        { physical: "110", reason: "Wrong vehicle", voided: true },
      ],
    }),
  );
  expect(lines).toHaveLength(3);
  expect(lines[0]).toContain("Original entry\nPhysical reading: 100");
  expect(lines[1]).toContain("Correction\nPhysical reading: 110");
  expect(lines[2]).toContain("Void\nPhysical reading: 110");
});
