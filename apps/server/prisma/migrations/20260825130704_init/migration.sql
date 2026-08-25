-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_llm_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,

    CONSTRAINT "user_llm_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_code_key" ON "sessions"("code");

-- CreateIndex
CREATE INDEX "sessions_leaderId_idx" ON "sessions"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "user_llm_configs_userId_key" ON "user_llm_configs"("userId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_llm_configs" ADD CONSTRAINT "user_llm_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
