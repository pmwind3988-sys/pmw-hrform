import { describe, expect, it } from "vitest";

import { bearerFromHeaders } from "./viewerIdentity.js";

describe("bearerFromHeaders", () => {
  it("reads a bearer token", () => {
    expect(bearerFromHeaders({ authorization: "Bearer abc.def" })).toBe("abc.def");
  });

  it("does not care how the header name is cased", () => {
    expect(bearerFromHeaders({ Authorization: "Bearer abc" })).toBe("abc");
    expect(bearerFromHeaders({ AUTHORIZATION: "Bearer abc" })).toBe("abc");
  });

  it("accepts the scheme in any case, as the wire allows", () => {
    expect(bearerFromHeaders({ authorization: "bearer abc" })).toBe("abc");
    expect(bearerFromHeaders({ authorization: "BEARER abc" })).toBe("abc");
  });

  it("takes the first value when the runtime hands back an array", () => {
    expect(bearerFromHeaders({ authorization: ["Bearer abc", "Bearer xyz"] })).toBe("abc");
  });

  it("returns nothing when there is no usable bearer", () => {
    expect(bearerFromHeaders({})).toBe("");
    expect(bearerFromHeaders({ authorization: "" })).toBe("");
    expect(bearerFromHeaders({ authorization: undefined })).toBe("");
    // A different scheme is not a bearer, and must not be read as one.
    expect(bearerFromHeaders({ authorization: "Basic dXNlcjpwYXNz" })).toBe("");
    // "Bearer" with nothing after it is not a token either.
    expect(bearerFromHeaders({ authorization: "Bearer" })).toBe("");
  });

  it("trims the surrounding whitespace a proxy may add", () => {
    expect(bearerFromHeaders({ authorization: "Bearer   abc  " })).toBe("abc");
  });
});
