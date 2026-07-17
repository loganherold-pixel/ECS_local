import React from 'react';

import type { ConvoyCommandWorkspacePresentation } from '../../lib/convoy/convoyCommandSelectors';

type DispatchConvoyWorkspaceSlotProps = {
  presentation: ConvoyCommandWorkspacePresentation;
  signalSurface: React.ReactNode;
  commandSurface: React.ReactNode;
  standbySurface: React.ReactNode;
};

/**
 * Owns the mutually exclusive primary Dispatch convoy slot.
 *
 * Active presentations may compose signal and command regions, but the
 * standby subtree is never mounted alongside either active region.
 */
export default function DispatchConvoyWorkspaceSlot({
  presentation,
  signalSurface,
  commandSurface,
  standbySurface,
}: DispatchConvoyWorkspaceSlotProps) {
  return (
    <>
      {presentation.showSignalSurface
        ? signalSurface
        : presentation.showStandbySurface
          ? standbySurface
          : null}
      {presentation.showCommandSurface ? commandSurface : null}
    </>
  );
}
