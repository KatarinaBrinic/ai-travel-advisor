-- CreateTable
CREATE TABLE "Traveler" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "travelerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tripPlanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_tripPlanId_fkey" FOREIGN KEY ("tripPlanId") REFERENCES "TripPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "travelerId" TEXT NOT NULL,
    "destination" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "days" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripPlan_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TravelerFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "travelerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceConversationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TravelerFact_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "content" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Conversation_travelerId_idx" ON "Conversation"("travelerId");

-- CreateIndex
CREATE INDEX "Conversation_tripPlanId_idx" ON "Conversation"("tripPlanId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "TripPlan_travelerId_idx" ON "TripPlan"("travelerId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelerFact_travelerId_key_key" ON "TravelerFact"("travelerId", "key");
