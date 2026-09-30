import { advanceStay, shouldLookUp, type LocationFix } from "./visit-rules";

const MINUTE = 60_000;
const mall = { latitude: 14.6565, longitude: 121.0296 };
// About 1.1 km north of the mall.
const road = { latitude: 14.6665, longitude: 121.0296 };

function fix(point: { latitude: number; longitude: number }, minute: number, accuracy = 20) {
  return { ...point, accuracy, timestamp: minute * MINUTE } satisfies LocationFix;
}

function finishedAt(arrivedMinute: number, leftMinute: number) {
  return { ...mall, accuracy: 20, arrivedAt: arrivedMinute * MINUTE, leftAt: leftMinute * MINUTE };
}

// 14:00 local, well outside quiet hours.
const AFTERNOON = 14;

describe("advanceStay", () => {
  it("ends a stay at the first fix outside its radius and starts the next one there", () => {
    const { stay, finished } = advanceStay(null, [
      fix(mall, 0),
      fix({ latitude: 14.6567, longitude: 121.0297 }, 20),
      fix(road, 45),
    ]);

    expect(finished).toEqual([{ ...mall, accuracy: 20, arrivedAt: 0, leftAt: 45 * MINUTE }]);
    expect(stay).toMatchObject({ ...road, arrivedAt: 45 * MINUTE });
  });

  it("moves the anchor to a more accurate fix but keeps the arrival time", () => {
    const sharper = { latitude: 14.6566, longitude: 121.0297 };
    const { stay } = advanceStay(null, [fix(mall, 0, 90), fix(sharper, 10, 15)]);

    expect(stay).toEqual({ ...sharper, accuracy: 15, arrivedAt: 0 });
  });

  it("ignores fixes too inaccurate to end a stay", () => {
    const { stay, finished } = advanceStay(null, [fix(mall, 0), fix(road, 10, 500)]);

    expect(finished).toEqual([]);
    expect(stay).toMatchObject({ ...mall, arrivedAt: 0 });
  });
});

describe("shouldLookUp", () => {
  it("asks only about stays between five minutes and four hours", () => {
    expect(shouldLookUp(finishedAt(0, 4), [], AFTERNOON)).toBe(false);
    expect(shouldLookUp(finishedAt(0, 30), [], AFTERNOON)).toBe(true);
    expect(shouldLookUp(finishedAt(0, 5 * 60), [], AFTERNOON)).toBe(false);
  });

  it("stays quiet from 10 PM to 7 AM", () => {
    expect(shouldLookUp(finishedAt(0, 30), [], 22)).toBe(false);
    expect(shouldLookUp(finishedAt(0, 30), [], 6)).toBe(false);
    expect(shouldLookUp(finishedAt(0, 30), [], 7)).toBe(true);
  });

  it("skips a stay next to an excluded place without a lookup", () => {
    const home = { id: "home", name: "Sari-sari store", ...mall };
    expect(shouldLookUp(finishedAt(0, 30), [home], AFTERNOON)).toBe(false);
    expect(shouldLookUp(finishedAt(0, 30), [{ ...home, ...road }], AFTERNOON)).toBe(true);
  });
});
