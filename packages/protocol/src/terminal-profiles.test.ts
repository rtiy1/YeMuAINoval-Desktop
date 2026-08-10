import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERMINAL_PROFILES,
  PROMPT_SENTINEL,
  formatResolvedCommand,
  getTerminalProfileIcon,
  guessTerminalProfileIcon,
  profileTakesPrompt,
  resolveTerminalProfiles,
  substitutePrompt,
} from "./terminal-profiles.js";

describe("MCode terminal profile", () => {
  it("is the only default terminal agent", () => {
    expect(DEFAULT_TERMINAL_PROFILES).toEqual([
      {
        id: "mcode",
        name: "MCode",
        command: "mcode",
        args: [PROMPT_SENTINEL],
        icon: "mcode",
      },
    ]);
  });

  it("returns defaults only when profiles are undefined", () => {
    expect(resolveTerminalProfiles(undefined)).toBe(DEFAULT_TERMINAL_PROFILES);
    expect(resolveTerminalProfiles([])).toEqual([]);
  });

  it("upgrades a persisted MCode profile to accept prompts", () => {
    const [profile] = resolveTerminalProfiles([
      { id: "mcode", name: "MCode", command: "mcode", args: ["--verbose"] },
    ]);
    expect(profile?.args).toEqual(["--verbose", PROMPT_SENTINEL]);
  });

  it("recognizes absolute and Windows MCode commands", () => {
    const [unix, windows] = resolveTerminalProfiles([
      { id: "one", name: "MCode", command: "/usr/local/bin/mcode" },
      { id: "two", name: "MCode", command: "C:\\npm\\mcode.cmd" },
    ]);
    expect(unix?.args).toEqual([PROMPT_SENTINEL]);
    expect(windows?.args).toEqual([PROMPT_SENTINEL]);
  });

  it("does not modify unrelated commands", () => {
    const original = { id: "shell", name: "PowerShell", command: "pwsh" };
    expect(resolveTerminalProfiles([original])[0]).toBe(original);
  });
});

describe("terminal prompt substitution", () => {
  it("detects the sentinel in command or arguments", () => {
    expect(profileTakesPrompt({ command: "mcode", args: [PROMPT_SENTINEL] })).toBe(true);
    expect(profileTakesPrompt({ command: `mcode ${PROMPT_SENTINEL}` })).toBe(true);
    expect(profileTakesPrompt({ command: "mcode" })).toBe(false);
  });

  it("substitutes a prompt verbatim", () => {
    expect(
      substitutePrompt({ command: "mcode", args: [PROMPT_SENTINEL] }, 'a "quoted" prompt'),
    ).toEqual({ command: "mcode", args: ['a "quoted" prompt'] });
  });

  it("drops a prompt-only argument when the prompt is empty", () => {
    expect(substitutePrompt({ command: "mcode", args: [PROMPT_SENTINEL] }, "")).toEqual({
      command: "mcode",
      args: [],
    });
  });

  it("substitutes every embedded occurrence", () => {
    expect(
      substitutePrompt(
        { command: `${PROMPT_SENTINEL}-run`, args: [`${PROMPT_SENTINEL}/x`] },
        "draft",
      ),
    ).toEqual({ command: "draft-run", args: ["draft/x"] });
  });

  it("formats the resolved command", () => {
    expect(formatResolvedCommand({ command: "mcode", args: ["draft chapter one"] })).toBe(
      "mcode draft chapter one",
    );
  });
});

describe("terminal icons", () => {
  it.each([
    ["mcode", "mcode"],
    ["MCode", "mcode"],
    ["C:\\npm\\mcode.cmd", "mcode"],
  ])("guesses %s as %s", (command, icon) => {
    expect(guessTerminalProfileIcon(command)).toBe(icon);
  });

  it("keeps explicit icons and leaves unknown commands unresolved", () => {
    expect(
      getTerminalProfileIcon({ id: "one", name: "MCode", command: "pwsh", icon: "mcode" }),
    ).toBe("mcode");
    expect(guessTerminalProfileIcon("pwsh")).toBeUndefined();
  });
});
