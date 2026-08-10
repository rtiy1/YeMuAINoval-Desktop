import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box } from '../../ink.js';
import { getInitialSettings } from '../../utils/settings/settings.js';
import { MCodeLogo } from './MCodeLogo.js';

type Frame = {
  offset: number;
};

/** Hold an offset for n frames (60ms each). */
function hold(offset: number, frames: number): Frame[] {
  return Array.from({ length: frames }, () => ({ offset }));
}

// Offset semantics: marginTop in a fixed-height container. 0 = normal,
// 1 = crouched. Container height stays fixed so the layout never shifts;
// during a crouch the logo dips below the container and gets clipped —
// reads as "ducking below the frame" before springing back up.
const JUMP_WAVE: readonly Frame[] = [
  // crouch
  ...hold(1, 2),
  // spring!
  ...hold(0, 3),
  ...hold(1, 2),
  // spring again!
  ...hold(0, 3),
];
const CLICK_ANIMATIONS: readonly (readonly Frame[])[] = [JUMP_WAVE, JUMP_WAVE];
const IDLE: Frame = { offset: 0 };
const FRAME_MS = 60;
const LOGO_HEIGHT = 4;

/**
 * MCodeLogo with click-triggered bounce animations. Container height is
 * fixed at LOGO_HEIGHT — same footprint as a bare `<MCodeLogo />` — so the
 * surrounding layout never shifts. Click only fires when mouse tracking is
 * enabled (i.e. inside `<AlternateScreen>` / fullscreen); elsewhere this
 * renders and behaves identically to plain `<MCodeLogo />`.
 */
export function AnimatedMCodeLogo() {
  const { bounceOffset, onClick } = useLogoAnimation();
  return (
    <Box height={LOGO_HEIGHT} flexDirection="column" onClick={onClick}>
      <Box marginTop={bounceOffset} flexShrink={0}>
        <MCodeLogo />
      </Box>
    </Box>
  );
}

function useLogoAnimation(): {
  bounceOffset: number;
  onClick: () => void;
} {
  // Read once at mount — no useSettings() subscription, since that would
  // re-render on any settings change.
  const [reducedMotion] = useState(() => getInitialSettings().prefersReducedMotion ?? false);
  const [frameIndex, setFrameIndex] = useState(-1);
  const sequenceRef = useRef<readonly Frame[]>(JUMP_WAVE);
  const onClick = () => {
    if (reducedMotion || frameIndex !== -1) return;
    sequenceRef.current = CLICK_ANIMATIONS[Math.floor(Math.random() * CLICK_ANIMATIONS.length)]!;
    setFrameIndex(0);
  };
  useEffect(() => {
    if (frameIndex === -1) return;
    if (frameIndex >= sequenceRef.current.length) {
      setFrameIndex(-1);
      return;
    }
    const timer = setTimeout(setFrameIndex, FRAME_MS, frameIndex + 1);
    return () => clearTimeout(timer);
  }, [frameIndex]);
  const seq = sequenceRef.current;
  const current = frameIndex >= 0 && frameIndex < seq.length ? seq[frameIndex]! : IDLE;
  return {
    bounceOffset: current.offset,
    onClick,
  };
}
