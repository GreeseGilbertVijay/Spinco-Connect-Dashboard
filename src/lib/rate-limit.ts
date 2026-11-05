import { prisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 5;

// One atomic update per check: a transaction here aborts with write conflicts
// on MongoDB when parallel requests share a bucket.
async function incrementBucket(key: string, windowMs: number) {
  const expired = {
    $gte: [{ $subtract: ["$$NOW", { $ifNull: ["$windowStart", "$$NOW"] }] }, windowMs],
  };
  const result = await prisma.$runCommandRaw({
    findAndModify: "spinco_connect_rate_limits",
    query: { _id: key },
    upsert: true,
    new: true,
    fields: { count: 1 },
    update: [
      {
        $set: {
          count: { $cond: [expired, 1, { $add: [{ $ifNull: ["$count", 0] }, 1] }] },
          windowStart: { $cond: [expired, "$$NOW", { $ifNull: ["$windowStart", "$$NOW"] }] },
          updatedAt: "$$NOW",
        },
      },
    ],
  });
  return (result as unknown as { value: { count: number } }).value.count;
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return (await incrementBucket(key, windowMs)) <= limit;
    } catch (error) {
      // Parallel first requests can race to insert a new bucket, and Atlas can
      // reset an idle connection. Both are safe to retry.
      if (!/E11000|I\/O error/.test(String(error)) || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
