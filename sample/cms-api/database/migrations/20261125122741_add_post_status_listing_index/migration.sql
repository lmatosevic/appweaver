-- CreateIndex
CREATE INDEX "Post_status_createdAt_id_idx" ON "Post"("status", "createdAt" DESC, "id" ASC);
