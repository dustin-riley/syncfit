import { describe, it, expect, vi } from "vitest";
import { handlePlanWeek } from "@/lib/plan-week-handler";
import type { PlanDay } from "@/lib/plan-store";

function makeReq(): Request {
  return new Request("http://test.local/api/plan/week");
}

const sampleDay: PlanDay = {
  dayOfWeek: 3,
  title: "Heavy lifts",
  notes: "focus on back squat",
  modality: "strength",
  exercises: [
    {
      id: "ex-1",
      name: "Back squat",
      targetSets: 4,
      targetReps: 5,
      targetWeight: 245,
    },
  ],
};

describe("handlePlanWeek", () => {
  it("returns 401 when auth resolves null", async () => {
    const res = await handlePlanWeek(makeReq(), {
      auth: async () => null,
      load: async () => [],
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with days from load", async () => {
    const res = await handlePlanWeek(makeReq(), {
      auth: async () => ({ userId: "u-1" }),
      load: async () => [sampleDay],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: [sampleDay] });
  });

  it("returns 200 with empty days when load returns nothing", async () => {
    const res = await handlePlanWeek(makeReq(), {
      auth: async () => ({ userId: "u-1" }),
      load: async () => [],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: [] });
  });

  it("returns 500 with generic body when load throws, without leaking driver message", async () => {
    const res = await handlePlanWeek(makeReq(), {
      auth: async () => ({ userId: "u-1" }),
      load: async () => {
        throw new Error("connection refused: 127.0.0.1:5432");
      },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "couldn't load plan" });
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
  });

  it("passes resolved userId to load", async () => {
    const loadSpy = vi.fn(async () => []);
    await handlePlanWeek(makeReq(), {
      auth: async () => ({ userId: "user-abc" }),
      load: loadSpy,
    });
    expect(loadSpy).toHaveBeenCalledWith("user-abc");
  });
});
