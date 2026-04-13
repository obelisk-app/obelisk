-- Forum post subscriptions (follows). Replaces the prior localStorage-backed model.
CREATE TABLE "PostSubscription" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostSubscription_postId_pubkey_key" ON "PostSubscription"("postId", "pubkey");
CREATE INDEX "PostSubscription_pubkey_idx" ON "PostSubscription"("pubkey");
CREATE INDEX "PostSubscription_postId_idx" ON "PostSubscription"("postId");
