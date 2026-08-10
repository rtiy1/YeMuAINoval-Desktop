import { describe, expect, it } from "vitest";
import { resolveCliInstallSourcePath } from "./path";

describe("cli-install-path", () => {
  it("uses the bundled shim for packaged macOS installs", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "darwin",
        isPackaged: true,
        executablePath: "/Applications/YeMu AI Novel.app/Contents/MacOS/YeMu AI Novel",
        shimPath: "/Applications/YeMu AI Novel.app/Contents/Resources/bin/paseo",
      }),
    ).toBe("/Applications/YeMu AI Novel.app/Contents/Resources/bin/paseo");
  });

  it("prefers the original AppImage path on linux", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "linux",
        isPackaged: true,
        executablePath: "/tmp/.mount_paseo123/paseo",
        shimPath: "/tmp/.mount_paseo123/resources/bin/paseo",
        appImagePath: "/home/user/Applications/YeMu AI Novel.AppImage",
      }),
    ).toBe("/home/user/Applications/YeMu AI Novel.AppImage");
  });

  it("falls back to the shim on windows and in development", () => {
    expect(
      resolveCliInstallSourcePath({
        platform: "win32",
        isPackaged: true,
        executablePath: "C:\\Users\\user\\AppData\\Local\\Programs\\YeMu AI Novel\\YeMu AI Novel.exe",
        shimPath: "C:\\Users\\user\\AppData\\Local\\Programs\\YeMu AI Novel\\resources\\bin\\paseo.cmd",
      }),
    ).toBe("C:\\Users\\user\\AppData\\Local\\Programs\\YeMu AI Novel\\resources\\bin\\paseo.cmd");

    expect(
      resolveCliInstallSourcePath({
        platform: "linux",
        isPackaged: false,
        executablePath: "/opt/YeMu AI Novel/paseo",
        shimPath: "/opt/YeMu AI Novel/resources/bin/paseo",
      }),
    ).toBe("/opt/YeMu AI Novel/resources/bin/paseo");
  });
});
