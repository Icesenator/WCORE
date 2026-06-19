/*
  Warnings:

  - You are about to drop the column `chainId` on the `onchain_gms` table. All the data in the column will be lost.
  - You are about to drop the column `contract` on the `onchain_gms` table. All the data in the column will be lost.
  - Added the required column `contractId` to the `onchain_gms` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "onchain_gms" DROP COLUMN "chainId",
DROP COLUMN "contract",
ADD COLUMN     "chainKey" TEXT NOT NULL DEFAULT 'base',
ADD COLUMN     "contractId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "gm_contracts" (
    "id" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gm_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_chain_gms" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "lastGmDate" TIMESTAMP(3) NOT NULL,
    "gmStreak" INTEGER NOT NULL DEFAULT 1,
    "longestStreak" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_chain_gms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gm_contracts_chainKey_contractAddress_key" ON "gm_contracts"("chainKey", "contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "user_chain_gms_userId_chainKey_key" ON "user_chain_gms"("userId", "chainKey");

-- AddForeignKey
ALTER TABLE "gm_contracts" ADD CONSTRAINT "gm_contracts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onchain_gms" ADD CONSTRAINT "onchain_gms_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "gm_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_chain_gms" ADD CONSTRAINT "user_chain_gms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
