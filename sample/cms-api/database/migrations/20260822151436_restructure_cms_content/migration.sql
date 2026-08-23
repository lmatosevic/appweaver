/*
  Warnings:

  - You are about to drop the column `approved` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `authorName` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `counter` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `jsonLd` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `lastActivity` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `secret` on the `User` table. All the data in the column will be lost.
  - The required column `uid` was added to the `Post` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Category_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Page" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT DEFAULT 'Draft',
    "publishedAt" DATETIME,
    "showInMenu" BOOLEAN NOT NULL DEFAULT false,
    "menuPosition" INTEGER NOT NULL DEFAULT 0,
    "seo" JSONB,
    "authorId" INTEGER,
    "heroImageId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Page_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Page_heroImageId_fkey" FOREIGN KEY ("heroImageId") REFERENCES "File" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Page_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Tag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_PostTagsTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_PostTagsTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PostTagsTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "status" TEXT DEFAULT 'Pending',
    "postId" INTEGER NOT NULL,
    "attachmentId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "File" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Comment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Comment" ("attachmentId", "body", "createdAt", "createdById", "id", "postId", "updatedAt") SELECT "attachmentId", "body", "createdAt", "createdById", "id", "postId", "updatedAt" FROM "Comment";
DROP TABLE "Comment";
ALTER TABLE "new_Comment" RENAME TO "Comment";
CREATE UNIQUE INDEX "Comment_attachmentId_key" ON "Comment"("attachmentId");
CREATE INDEX "Comment_status_createdAt_idx" ON "Comment"("status", "createdAt" DESC);
CREATE TABLE "new_Post" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT,
    "status" TEXT DEFAULT 'Draft',
    "publishedAt" DATETIME,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "seo" JSONB,
    "authorId" INTEGER,
    "categoryId" INTEGER,
    "pinnedCommentId" TEXT,
    "coverImageId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_pinnedCommentId_fkey" FOREIGN KEY ("pinnedCommentId") REFERENCES "Comment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "File" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("authorId", "content", "coverImageId", "createdAt", "createdById", "id", "pinnedCommentId", "slug", "status", "title", "updatedAt") SELECT "authorId", "content", "coverImageId", "createdAt", "createdById", "id", "pinnedCommentId", "slug", "status", "title", "updatedAt" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_uid_key" ON "Post"("uid");
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE UNIQUE INDEX "Post_pinnedCommentId_key" ON "Post"("pinnedCommentId");
CREATE UNIQUE INDEX "Post_coverImageId_key" ON "Post"("coverImageId");
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt" DESC);
CREATE INDEX "Post_categoryId_publishedAt_idx" ON "Post"("categoryId", "publishedAt" DESC);
CREATE INDEX "Post_createdAt_id_idx" ON "Post"("createdAt" DESC, "id" ASC);
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "displayName" TEXT,
    "bio" TEXT,
    "website" TEXT,
    "internalNotes" TEXT,
    "passwordHash" TEXT,
    "verifiedEmail" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorAuth" TEXT NOT NULL DEFAULT 'None',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "logoutAt" DATETIME,
    "avatarId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    CONSTRAINT "User_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "File" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarId", "createdAt", "createdById", "email", "enabled", "firstName", "id", "lastName", "logoutAt", "passwordHash", "phone", "twoFactorAuth", "updatedAt", "verifiedEmail") SELECT "avatarId", "createdAt", "createdById", "email", "enabled", "firstName", "id", "lastName", "logoutAt", "passwordHash", "phone", "twoFactorAuth", "updatedAt", "verifiedEmail" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_avatarId_key" ON "User"("avatarId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_position_idx" ON "Category"("parentId", "position" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Page_heroImageId_key" ON "Page"("heroImageId");

-- CreateIndex
CREATE INDEX "Page_status_menuPosition_idx" ON "Page"("status", "menuPosition" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "_PostTagsTag_AB_unique" ON "_PostTagsTag"("A", "B");

-- CreateIndex
CREATE INDEX "_PostTagsTag_B_index" ON "_PostTagsTag"("B");
