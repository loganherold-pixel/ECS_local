import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "../src/app/page";

describe("ECS trail landing page", () => {
  it("renders the legal-authority posture and trail system identity", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain("ECS Vehicle Trail System");
    expect(markup).toContain("Mapbox is not the legal trail authority");
    expect(markup).toContain("Verified motorized access");
  });
});
