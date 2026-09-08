import { vi } from "vitest";
import "@testing-library/jest-dom";

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    label: "main",
    startDragging: vi.fn(),
    close: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    setSize: vi.fn(),
    setPosition: vi.fn(),
  })),
  currentMonitor: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));
