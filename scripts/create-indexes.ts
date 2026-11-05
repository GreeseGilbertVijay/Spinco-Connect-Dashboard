import { prisma } from "../src/lib/prisma";

// Additive and safe to re-run. The database is shared with other apps, so this
// replaces `prisma db push` and only ever creates this backend's own collections.
const indexes = {
  spinco_connect_admins: [{ key: { email: 1 }, name: "email_unique", unique: true }],
  spinco_connect_devices: [
    { key: { deviceId: 1 }, name: "deviceId_unique", unique: true },
    { key: { tokenHash: 1 }, name: "tokenHash_unique", unique: true },
    { key: { assignedImageId: 1 }, name: "assignedImageId" },
    { key: { lastDisplayedImageId: 1 }, name: "lastDisplayedImageId" },
  ],
  spinco_connect_images: [{ key: { storageKey: 1 }, name: "storageKey_unique", unique: true }],
  spinco_connect_pairings: [
    { key: { codeHash: 1 }, name: "codeHash_unique", unique: true },
    {
      key: { deviceId: 1 },
      name: "deviceId_unique_when_paired",
      unique: true,
      partialFilterExpression: { deviceId: { $type: "string" } },
    },
  ],
};

async function main() {
  for (const [collection, definitions] of Object.entries(indexes)) {
    await prisma.$runCommandRaw({ createIndexes: collection, indexes: definitions });
    console.log(`Indexes ready: ${collection}`);
  }
  await prisma.$runCommandRaw({ create: "spinco_connect_rate_limits" }).catch((error: unknown) => {
    if (!String(error).includes("NamespaceExists")) throw error;
  });
  console.log("Collection ready: spinco_connect_rate_limits");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
