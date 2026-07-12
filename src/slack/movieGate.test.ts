import { describe, it, expect, beforeEach } from "vitest";
import { MovieGate } from "./movieGate";

describe("MovieGate", () => {
  let gate: MovieGate;
  beforeEach(() => { gate = new MovieGate({ primedWindowMs: 10_000, now: () => 1_000 }); });

  it("refuses a first movie request and primes the user", () => {
    expect(gate.decide("U1", "make me a movie")).toBe("refuse");
  });

  it("caves when a primed user begs", () => {
    gate.decide("U1", "make me a movie"); // refuse + prime
    expect(gate.decide("U1", "please just a teaser")).toBe("cave");
  });

  it("caves when a primed user asks for a movie again", () => {
    gate.decide("U1", "movie");
    expect(gate.decide("U1", "cmon movie")).toBe("cave");
  });

  it("refuses again if the primed window expired", () => {
    let t = 1_000;
    const g = new MovieGate({ primedWindowMs: 5_000, now: () => t });
    g.decide("U1", "movie"); // primed at t=1000
    t = 10_000;              // window expired
    expect(g.decide("U1", "please")).toBe("refuse");
  });

  it("deflects while a render is in progress", () => {
    gate.decide("U1", "movie");
    gate.decide("U1", "please"); // cave
    gate.markRendering("U1");
    expect(gate.decide("U1", "another movie")).toBe("deflect");
  });

  it("returns 'ignore' for non-movie text", () => {
    expect(gate.decide("U1", "hey what's up")).toBe("ignore");
  });

  it("does not cave on a generic word like 'just' from a primed user", () => {
    gate.decide("U1", "movie"); // refuse + prime
    expect(gate.decide("U1", "just checking in on the deploy")).toBe("ignore");
  });

  it("ignores a beg once the prime is stale beyond the beg window", () => {
    let t = 1_000;
    const g = new MovieGate({ primedWindowMs: 5_000, begWindowMs: 20_000, now: () => t });
    g.decide("U1", "movie"); // primed at t=1000
    t = 100_000;             // way past both windows
    expect(g.decide("U1", "please")).toBe("ignore");
  });

  it("clears rendering so the user can request again", () => {
    gate.decide("U1", "movie");
    gate.decide("U1", "please");
    gate.markRendering("U1");
    gate.clearRendering("U1");
    expect(gate.decide("U1", "movie")).toBe("refuse");
  });
});
