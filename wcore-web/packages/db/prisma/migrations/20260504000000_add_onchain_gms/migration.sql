-- CreateTable
CREATE TABLE "onchain_gms" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 8453,
    "contract" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onchain_gms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onchain_gms_txHash_key" ON "onchain_gms"("txHash");

-- AddForeignKey
ALTER TABLE "onchain_gms" ADD CONSTRAINT "onchain_gms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
