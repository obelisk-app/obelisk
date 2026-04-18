-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "nwcUrlEncrypted" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_pubkey_key" ON "Wallet"("pubkey");

-- CreateIndex
CREATE INDEX "Wallet_pubkey_idx" ON "Wallet"("pubkey");
