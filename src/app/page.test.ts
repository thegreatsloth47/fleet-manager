import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import HomePage from "@/app/page";

test("the home page renders the application heading", () => {
  const html = renderToStaticMarkup(createElement(HomePage));

  expect(html).toContain("<h1>Fleet Manager</h1>");
});
