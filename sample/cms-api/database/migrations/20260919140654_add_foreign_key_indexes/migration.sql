-- DropIndex
DROP INDEX "ConnectedAccount_provider_providerAccountId_idx";

-- DropIndex
DROP INDEX "File_resourceField_resourceName_resourceId_idx";

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_createdById_idx" ON "ApiKey"("createdById");

-- CreateIndex
CREATE INDEX "Category_createdById_idx" ON "Category"("createdById");

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Comment_createdById_idx" ON "Comment"("createdById");

-- CreateIndex
CREATE INDEX "Comment_deletedById_idx" ON "Comment"("deletedById");

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_provider_providerAccountId_key" ON "ConnectedAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "File_resourceName_resourceId_resourceField_idx" ON "File"("resourceName", "resourceId", "resourceField");

-- CreateIndex
CREATE INDEX "File_createdById_idx" ON "File"("createdById");

-- CreateIndex
CREATE INDEX "File_deletedById_idx" ON "File"("deletedById");

-- CreateIndex
CREATE INDEX "Page_authorId_idx" ON "Page"("authorId");

-- CreateIndex
CREATE INDEX "Page_createdById_idx" ON "Page"("createdById");

-- CreateIndex
CREATE INDEX "Permission_createdById_idx" ON "Permission"("createdById");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- CreateIndex
CREATE INDEX "Post_createdById_idx" ON "Post"("createdById");

-- CreateIndex
CREATE INDEX "Post_deletedById_idx" ON "Post"("deletedById");

-- CreateIndex
CREATE INDEX "Role_createdById_idx" ON "Role"("createdById");

-- CreateIndex
CREATE INDEX "Tag_createdById_idx" ON "Tag"("createdById");

-- CreateIndex
CREATE INDEX "User_createdById_idx" ON "User"("createdById");
