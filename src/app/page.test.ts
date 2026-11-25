import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import HomePage, { metadata } from "@/app/page";

test("public introduction explains the available product and account entry", () => {
  const html = renderToStaticMarkup(createElement(HomePage));
  expect(html).toContain("FleetFalcon");
  expect(html).toContain("Less spreadsheet work. More clarity on maintenance.");
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain('href="/auth"');
  expect(html).toContain("Get started");
  expect(html).toContain('href="/organizations"');
  expect(html).toContain('id="how-it-works"');
  expect(html).toContain(
    "An internet connection is required to confirm saves.",
  );
});

test("public search metadata describes shipped fleet workflows", () => {
  expect(metadata.title).toBe(
    "FleetFalcon | Fleet maintenance for small businesses",
  );
  expect(metadata.description).toContain(
    "vehicle details, mileage, maintenance schedules and service history",
  );
});
