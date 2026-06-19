-- CreateTable
CREATE TABLE "custom_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "label" TEXT,
    "chainType" TEXT NOT NULL DEFAULT 'EVM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_tokens_userId_contract_key" ON "custom_tokens"("userId", "contract");

-- AddForeignKey
ALTER TABLE "custom_tokens" ADD CONSTRAINT "custom_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
