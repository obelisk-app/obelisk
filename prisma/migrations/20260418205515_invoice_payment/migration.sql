-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "paymentHash" TEXT NOT NULL,
    "messageId" TEXT,
    "channelId" TEXT,
    "payerPubkey" TEXT NOT NULL,
    "payeePubkey" TEXT,
    "amountSats" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_paymentHash_key" ON "InvoicePayment"("paymentHash");

-- CreateIndex
CREATE INDEX "InvoicePayment_messageId_idx" ON "InvoicePayment"("messageId");

-- CreateIndex
CREATE INDEX "InvoicePayment_channelId_idx" ON "InvoicePayment"("channelId");
