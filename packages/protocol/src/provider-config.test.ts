import { describe, expect, test } from "vitest";

import { ProviderOverridesSchema } from "./provider-config.js";

describe("ProviderOverridesSchema", () => {
  test("accepts MCode runtime and model customization", () => {
    expect(
      ProviderOverridesSchema.safeParse({
        mcode: {
          command: ["mcode", "--verbose"],
          env: { MCODE_CONFIG_DIR: "C:\\isolated\\mcode" },
          models: [{ id: "novel-pro", label: "Novel Pro", isDefault: true }],
        },
      }).success,
    ).toBe(true);
  });

  test.each(["claude", "codex", "opencode", "custom-acp"])(
    "rejects the non-MCode provider %s",
    (provider) => {
      const result = ProviderOverridesSchema.safeParse({
        [provider]: { label: provider, command: [provider], extends: "acp" },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain("dedicated to MCode");
    },
  );

  test("does not allow MCode to extend another provider", () => {
    const result = ProviderOverridesSchema.safeParse({
      mcode: { extends: "acp", command: ["mcode"] },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("cannot extend another provider");
  });
});
