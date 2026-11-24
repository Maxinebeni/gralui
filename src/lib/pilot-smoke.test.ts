import { describe, expect, it } from "vitest";
import { hasVotedThisMeeting } from "./claim-workflow";
import { readableCode } from "./api";

const ev = (sequence: number, action: string, actorId = "u1") => ({ sequence, action, actorId });

describe("committee vote", () => {
  it("hides the vote once this member has voted in the current meeting", () => {
    expect(hasVotedThisMeeting([ev(1, "COMMITTEE_CONVENED"), ev(2, "COMMITTEE_VOTE_RECORDED")], "u1")).toBe(true);
  });

  it("offers the vote again after a new meeting is recorded", () => {
    const events = [ev(1, "COMMITTEE_CONVENED"), ev(2, "COMMITTEE_VOTE_RECORDED"), ev(3, "COMMITTEE_CONVENED")];
    expect(hasVotedThisMeeting(events, "u1")).toBe(false);
  });

  it("ignores votes by other members", () => {
    expect(hasVotedThisMeeting([ev(1, "COMMITTEE_CONVENED"), ev(2, "COMMITTEE_VOTE_RECORDED", "u2")], "u1")).toBe(false);
    expect(hasVotedThisMeeting([ev(2, "COMMITTEE_VOTE_RECORDED")], undefined)).toBe(false);
  });
});

describe("readiness labels", () => {
  it("turns server codes into plain words", () => {
    expect(readableCode("POLICE_REPORT")).toBe("Police report");
    expect(readableCode("claim-form")).toBe("Claim form");
  });
});
