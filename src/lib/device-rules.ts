export function isPairingExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function isPlayerOnline(lastSeenAt: Date | null, now = new Date()) {
  return lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() < 45_000;
}

export function canReadAssignedImage(
  device: { assignedImageId: string | null; assignmentVersion: number; revokedAt: Date | null },
  imageId: string,
  version: number,
) {
  return (
    device.revokedAt === null &&
    device.assignedImageId === imageId &&
    device.assignmentVersion === version
  );
}

// MongoDB treats a missing field and an explicit null differently, and Prisma leaves
// revokedAt unset on new devices, so `revokedAt: null` alone never matches them.
export const notRevoked = { OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] };
