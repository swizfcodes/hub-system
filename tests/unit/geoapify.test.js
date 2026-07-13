"use strict";

/**
 * Geoapify reverse geocoding — best-effort behaviour.
 *
 * The clock-in path calls reverseGeocode() before opening the DB
 * transaction. It must never throw and must degrade gracefully so a
 * missing key or a geocoder outage can't block an employee clocking in.
 */

jest.mock("axios");
const axios = require("axios");

const logger = require("../../config/logger");
jest.spyOn(logger, "warn").mockImplementation(() => {});

const { reverseGeocode } = require("../../integrations/geocoding/geoapify");

const OLD_ENV = process.env.GEOAPIFY_API_KEY;
afterEach(() => {
  process.env.GEOAPIFY_API_KEY = OLD_ENV;
  jest.clearAllMocks();
});

describe("geoapify.reverseGeocode", () => {
  it("returns null (no HTTP call) when the API key is not configured", async () => {
    delete process.env.GEOAPIFY_API_KEY;
    const out = await reverseGeocode(6.4281, 3.4219);
    expect(out).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("returns null for invalid coordinates without calling the API", async () => {
    process.env.GEOAPIFY_API_KEY = "test-key";
    expect(await reverseGeocode(null, null)).toBeNull();
    expect(await reverseGeocode("abc", 3.42)).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("returns the formatted address from a format=json response", async () => {
    process.env.GEOAPIFY_API_KEY = "test-key";
    axios.get.mockResolvedValue({
      data: { results: [{ formatted: "12 Adeola Odeku St, Victoria Island, Lagos" }] },
    });
    const out = await reverseGeocode(6.4281, 3.4219);
    expect(out).toBe("12 Adeola Odeku St, Victoria Island, Lagos");
    const [, opts] = axios.get.mock.calls[0];
    expect(opts.params).toMatchObject({ lat: 6.4281, lon: 3.4219, apiKey: "test-key" });
  });

  it("falls back to a GeoJSON feature shape if that's what's returned", async () => {
    process.env.GEOAPIFY_API_KEY = "test-key";
    axios.get.mockResolvedValue({
      data: { features: [{ properties: { formatted: "Lekki Phase 1, Lagos" } }] },
    });
    expect(await reverseGeocode(6.44, 3.47)).toBe("Lekki Phase 1, Lagos");
  });

  it("returns null (never throws) when the request fails", async () => {
    process.env.GEOAPIFY_API_KEY = "test-key";
    axios.get.mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(reverseGeocode(6.4281, 3.4219)).resolves.toBeNull();
  });
});
