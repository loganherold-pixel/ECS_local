import type { ECSAccessResolution } from './entitlementTypes';

export interface ECSRoleSurfaceScopes {
  showAdminTools: boolean;
  showBillingActions: boolean;
  showFriendsAndFamilyControls: boolean;
  showPremiumExperience: boolean;
}

export function resolveRoleSurfaceScopes(access: ECSAccessResolution): ECSRoleSurfaceScopes {
  return {
    showAdminTools: access.canAccessAdminSurfaces,
    showBillingActions: access.canUseBillingFlows,
    showFriendsAndFamilyControls: access.canManageFriendsAndFamilyAccess,
    showPremiumExperience: access.hasFullAccess,
  };
}
