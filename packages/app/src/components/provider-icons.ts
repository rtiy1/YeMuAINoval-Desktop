import { Bot } from "lucide-react-native";
import type { ComponentType } from "react";
import { MCodeLogo } from "@/components/icons/mcode-logo";
import { resolveProviderIconName } from "@/components/provider-icon-name";

export interface ProviderIconProps {
  size: number;
  color: string;
}

export type ProviderIconComponent = ComponentType<ProviderIconProps>;

const BUILTIN_PROVIDER_ICONS: Record<string, ProviderIconComponent> = {
  mcode: MCodeLogo,
};

export function getProviderIcon(provider: string): ProviderIconComponent {
  const name = resolveProviderIconName(provider);
  if (name.kind === "builtin") {
    return BUILTIN_PROVIDER_ICONS[name.id];
  }
  return Bot;
}
