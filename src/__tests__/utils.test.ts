import { describe, it, expect } from "vitest";
import { loadClass } from "../hooks/useSystemStats";

describe("loadClass", () => {
  it("should return 'load-low' for percentages below 50", () => {
    expect(loadClass(0)).toBe("load-low");
    expect(loadClass(25)).toBe("load-low");
    expect(loadClass(49)).toBe("load-low");
  });

  it("should return 'load-mid' for percentages between 50 and 79", () => {
    expect(loadClass(50)).toBe("load-mid");
    expect(loadClass(65)).toBe("load-mid");
    expect(loadClass(79)).toBe("load-mid");
  });

  it("should return 'load-high' for percentages 80 and above", () => {
    expect(loadClass(80)).toBe("load-high");
    expect(loadClass(95)).toBe("load-high");
    expect(loadClass(100)).toBe("load-high");
  });
});
