import { describe, expect, it } from "vitest";
import { USERNAME_DOMAIN, USERNAME_PATTERN, emailToUsername, normalizeUsername, usernameToEmail } from "./username";

describe("username helpers", () => {
  it("maps usernames to the private email and back", () => {
    expect(usernameToEmail("  Jimmy ")).toBe(`jimmy@${USERNAME_DOMAIN}`);
    expect(emailToUsername(`jimmy@${USERNAME_DOMAIN}`)).toBe("jimmy");
    expect(emailToUsername("someone@other.com")).toBe("someone@other.com");
  });
  it("validates usernames", () => {
    expect(USERNAME_PATTERN.test(normalizeUsername("Cashier_1"))).toBe(true);
    expect(USERNAME_PATTERN.test("a b")).toBe(false);
    expect(USERNAME_PATTERN.test("ab")).toBe(false);
  });
});
