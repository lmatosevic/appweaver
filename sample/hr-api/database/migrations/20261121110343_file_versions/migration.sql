BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[File] ADD [lineageId] NVARCHAR(36),
[supersededAt] DATETIME2,
[version] INT NOT NULL CONSTRAINT [File_version_df] DEFAULT 1;

-- CreateIndex
CREATE NONCLUSTERED INDEX [File_lineageId_idx] ON [dbo].[File]([lineageId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

