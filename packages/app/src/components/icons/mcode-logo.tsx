import Svg, { Path } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

interface MCodeLogoProps {
  size?: number;
  color?: string;
}

function MCodeLogoBase({ size = 64, color }: MCodeLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path
        d="M12 46V18l20 24 20-24v28"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });

export const MCodeLogo = withUnistyles(MCodeLogoBase, foregroundColorMapping);
