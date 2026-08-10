import * as React from 'react';
import { Box, Text } from '../../ink.js';

// MCode monogram logo: a 4-row x 9-col pixel "M" built from full blocks,
// rendered in the mcode_body accent color.
const LOGO_ROWS = [
  '█       █',
  '██     ██',
  '█   █   █',
  '█       █',
] as const;

export function MCodeLogo() {
  return (
    <Box flexDirection="column">
      {LOGO_ROWS.map((row, i) => (
        <Text key={i} color="mcode_body">
          {row}
        </Text>
      ))}
    </Box>
  );
}
