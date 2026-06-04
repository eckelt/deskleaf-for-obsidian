import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("timer test", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("runAllTimersAsync only fires due timers (delay=0)", async () => {
    let count60 = 0;
    let count0 = 0;
    
    // 60min interval - not due yet
    const interval60 = setInterval(() => { count60++; }, 60 * 60 * 1000);
    // 0ms setTimeout - due immediately  
    setTimeout(() => { count0++; }, 0);
    
    await vi.runAllTimersAsync();
    clearInterval(interval60);
    
    console.log("count0:", count0, "count60:", count60);
    expect(count0).toBe(1);
    expect(count60).toBe(0); // runAllTimers should NOT fire this
  });
});
