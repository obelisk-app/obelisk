-- Wallet client-side migration: add status + preimage to InvoicePayment for
-- the new claim/confirm protocol; create Zap audit-log table.

-- 1. InvoicePayment: status + preimage
ALTER TABLE "InvoicePayment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE "InvoicePayment" ADD COLUMN "preimage" TEXT;
ALTER TABLE "InvoicePayment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "InvoicePayment_status_createdAt_idx" ON "InvoicePayment"("status", "createdAt");

-- 2. Zap audit log
CREATE TABLE "Zap" (
  "id"            TEXT PRIMARY KEY,
  "payerPubkey"   TEXT NOT NULL,
  "targetPubkey"  TEXT NOT NULL,
  "amountMsat"    BIGINT NOT NULL,
  "channelId"     TEXT,
  "messageId"     TEXT,
  "paymentHash"   TEXT NOT NULL UNIQUE,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Zap_targetPubkey_createdAt_idx" ON "Zap"("targetPubkey", "createdAt");
CREATE INDEX "Zap_messageId_idx" ON "Zap"("messageId");
