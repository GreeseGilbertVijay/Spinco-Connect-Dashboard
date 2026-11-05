export function isPairingExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function isPlayerOnline(lastSeenAt: Date | null, now = new Date()) {
  return lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() < 45_000;
}

export const SUPER_ADMIN_ROLE = "super_admin";

export function isSuperAdmin(admin: { role?: string | null }) {
  return admin.role === SUPER_ADMIN_ROLE;
}

export function adminName(admin: { name?: string | null; email: string }) {
  return admin.name || admin.email.split("@")[0];
}

// Spread into every device query made for a signed-in account.
export function deviceScope(admin: { id: string; role?: string | null }) {
  return isSuperAdmin(admin) ? {} : { ownerId: admin.id };
}

export const MAX_SLIDES = 20;
export const MIN_SLIDE_SECONDS = 3;
export const MAX_SLIDE_SECONDS = 900;
export const DEFAULT_SLIDE_SECONDS = 10;

type AssignedMedia = { assignedImageId: string | null; slideImageIds?: string[] };

export function playlistIds(device: AssignedMedia) {
  if (device.slideImageIds?.length) return device.slideImageIds;
  return device.assignedImageId ? [device.assignedImageId] : [];
}

export function canReadAssignedImage(
  device: AssignedMedia & { assignmentVersion: number; revokedAt: Date | null },
  imageId: string,
  version: number,
) {
  return (
    device.revokedAt === null &&
    playlistIds(device).includes(imageId) &&
    device.assignmentVersion === version
  );
}

// MongoDB treats a missing field and an explicit null differently, and Prisma leaves
// revokedAt unset on new devices, so `revokedAt: null` alone never matches them.
export const notRevoked = { OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] };
