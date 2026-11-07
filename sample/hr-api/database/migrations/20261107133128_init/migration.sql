BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Compensation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [baseSalary] FLOAT(53) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL CONSTRAINT [Compensation_currency_df] DEFAULT 'EUR',
    [bonusTargetPercent] FLOAT(53) NOT NULL CONSTRAINT [Compensation_bonusTargetPercent_df] DEFAULT 0,
    [reason] NVARCHAR(10) NOT NULL CONSTRAINT [Compensation_reason_df] DEFAULT 'Adjustment',
    [effectiveFrom] DATETIME2 NOT NULL,
    [notes] NVARCHAR(1000),
    [employeeId] UNIQUEIDENTIFIER NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Compensation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    [deletedAt] DATETIME2,
    [deletedById] UNIQUEIDENTIFIER,
    CONSTRAINT [Compensation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Department] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(100) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [costCenter] NVARCHAR(32),
    [headId] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Department_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    CONSTRAINT [Department_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Department_name_key] UNIQUE NONCLUSTERED ([name]),
    CONSTRAINT [Department_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[EmployeeDocument] (
    [id] INT NOT NULL IDENTITY(1,1),
    [title] NVARCHAR(200) NOT NULL,
    [category] NVARCHAR(11) NOT NULL CONSTRAINT [EmployeeDocument_category_df] DEFAULT 'Other',
    [validUntil] DATETIME2,
    [employeeId] UNIQUEIDENTIFIER NOT NULL,
    [fileId] INT,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EmployeeDocument_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    [deletedAt] DATETIME2,
    [deletedById] UNIQUEIDENTIFIER,
    CONSTRAINT [EmployeeDocument_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Employee] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [employeeNumber] NVARCHAR(1000) NOT NULL,
    [firstName] NVARCHAR(100) NOT NULL,
    [lastName] NVARCHAR(100) NOT NULL,
    [email] NVARCHAR(255) NOT NULL,
    [phone] NVARCHAR(32),
    [employmentType] NVARCHAR(10) NOT NULL CONSTRAINT [Employee_employmentType_df] DEFAULT 'FullTime',
    [status] NVARCHAR(10) NOT NULL CONSTRAINT [Employee_status_df] DEFAULT 'Active',
    [hireDate] DATETIME2 NOT NULL,
    [terminatedAt] DATETIME2,
    [passwordHash] NVARCHAR(1000),
    [verifiedEmail] BIT NOT NULL CONSTRAINT [Employee_verifiedEmail_df] DEFAULT 0,
    [phoneNumber] NVARCHAR(16),
    [verifiedPhone] BIT NOT NULL CONSTRAINT [Employee_verifiedPhone_df] DEFAULT 0,
    [enabled] BIT NOT NULL CONSTRAINT [Employee_enabled_df] DEFAULT 1,
    [logoutAt] DATETIME2,
    [departmentId] INT,
    [positionId] INT,
    [managerId] UNIQUEIDENTIFIER,
    [avatarId] INT,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Employee_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    [deletedAt] DATETIME2,
    [deletedById] UNIQUEIDENTIFIER,
    CONSTRAINT [Employee_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Employee_employeeNumber_key] UNIQUE NONCLUSTERED ([employeeNumber]),
    CONSTRAINT [Employee_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[LeaveBalance] (
    [id] INT NOT NULL IDENTITY(1,1),
    [year] INT NOT NULL,
    [allowanceDays] INT NOT NULL,
    [carriedOverDays] INT NOT NULL CONSTRAINT [LeaveBalance_carriedOverDays_df] DEFAULT 0,
    [usedDays] INT NOT NULL CONSTRAINT [LeaveBalance_usedDays_df] DEFAULT 0,
    [employeeId] UNIQUEIDENTIFIER NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LeaveBalance_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    [deletedAt] DATETIME2,
    [deletedById] UNIQUEIDENTIFIER,
    CONSTRAINT [LeaveBalance_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LeaveBalance_employeeId_year_key] UNIQUE NONCLUSTERED ([employeeId],[year])
);

-- CreateTable
CREATE TABLE [dbo].[LeaveRequest] (
    [id] INT NOT NULL IDENTITY(1,1),
    [type] NVARCHAR(8) NOT NULL CONSTRAINT [LeaveRequest_type_df] DEFAULT 'Annual',
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [days] INT NOT NULL,
    [reason] NVARCHAR(1000),
    [status] NVARCHAR(9) NOT NULL CONSTRAINT [LeaveRequest_status_df] DEFAULT 'Pending',
    [decidedAt] DATETIME2,
    [decisionNote] NVARCHAR(1000),
    [employeeId] UNIQUEIDENTIFIER,
    [decidedById] UNIQUEIDENTIFIER,
    [attachmentId] INT,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LeaveRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    [deletedAt] DATETIME2,
    [deletedById] UNIQUEIDENTIFIER,
    CONSTRAINT [LeaveRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PerformanceReview] (
    [id] INT NOT NULL IDENTITY(1,1),
    [period] NVARCHAR(1000) NOT NULL,
    [rating] INT NOT NULL,
    [strengths] NVARCHAR(4000),
    [improvements] NVARCHAR(4000),
    [goals] NVARCHAR(max),
    [status] NVARCHAR(6) NOT NULL CONSTRAINT [PerformanceReview_status_df] DEFAULT 'Draft',
    [employeeId] UNIQUEIDENTIFIER NOT NULL,
    [reviewerId] UNIQUEIDENTIFIER,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PerformanceReview_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    [deletedAt] DATETIME2,
    [deletedById] UNIQUEIDENTIFIER,
    CONSTRAINT [PerformanceReview_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PerformanceReview_employeeId_period_key] UNIQUE NONCLUSTERED ([employeeId],[period])
);

-- CreateTable
CREATE TABLE [dbo].[Position] (
    [id] INT NOT NULL IDENTITY(1,1),
    [title] NVARCHAR(150) NOT NULL,
    [level] NVARCHAR(9) NOT NULL CONSTRAINT [Position_level_df] DEFAULT 'Mid',
    [salaryMin] FLOAT(53) NOT NULL,
    [salaryMax] FLOAT(53) NOT NULL,
    [openings] INT NOT NULL CONSTRAINT [Position_openings_df] DEFAULT 0,
    [departmentId] INT NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Position_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    CONSTRAINT [Position_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Position_departmentId_title_level_key] UNIQUE NONCLUSTERED ([departmentId],[title],[level])
);

-- CreateTable
CREATE TABLE [dbo].[OneTimeToken] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tokenHash] NVARCHAR(128) NOT NULL,
    [purpose] NVARCHAR(64) NOT NULL,
    [data] NVARCHAR(max) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OneTimeToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [OneTimeToken_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [OneTimeToken_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(255) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Role_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Role_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Permission] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(255) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Permission_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    CONSTRAINT [Permission_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Permission_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[_seeders] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [checksum] NVARCHAR(255) NOT NULL,
    [seederName] NVARCHAR(511) NOT NULL,
    [startedAt] DATETIME2 NOT NULL,
    [finishedAt] DATETIME2 NOT NULL,
    [logs] NVARCHAR(1000),
    CONSTRAINT [_seeders_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [_seeders_seederName_key] UNIQUE NONCLUSTERED ([seederName])
);

-- CreateTable
CREATE TABLE [dbo].[File] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(1023) NOT NULL,
    [originalName] NVARCHAR(255) NOT NULL,
    [mimeType] NVARCHAR(127) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [checksum] NVARCHAR(127) NOT NULL,
    [title] NVARCHAR(511),
    [description] NVARCHAR(max),
    [resourceField] NVARCHAR(255),
    [resourceName] NVARCHAR(255),
    [resourceId] NVARCHAR(36),
    [updatedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [File_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdById] UNIQUEIDENTIFIER,
    [deletedAt] DATETIME2,
    [deletedById] UNIQUEIDENTIFIER,
    CONSTRAINT [File_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [File_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[_EmployeeRolesRole] (
    [A] UNIQUEIDENTIFIER NOT NULL,
    [B] INT NOT NULL,
    CONSTRAINT [_EmployeeRolesRole_AB_unique] UNIQUE NONCLUSTERED ([A],[B])
);

-- CreateTable
CREATE TABLE [dbo].[_RolePermissionsPermission] (
    [A] INT NOT NULL,
    [B] INT NOT NULL,
    CONSTRAINT [_RolePermissionsPermission_AB_unique] UNIQUE NONCLUSTERED ([A],[B])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Compensation_employeeId_effectiveFrom_idx] ON [dbo].[Compensation]([employeeId], [effectiveFrom] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Compensation_createdById_idx] ON [dbo].[Compensation]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Compensation_deletedById_idx] ON [dbo].[Compensation]([deletedById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Department_createdById_idx] ON [dbo].[Department]([createdById]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [Department_headId_key] ON [dbo].[Department]([headId]) WHERE ([headId] IS NOT NULL);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmployeeDocument_employeeId_category_idx] ON [dbo].[EmployeeDocument]([employeeId], [category]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmployeeDocument_createdById_idx] ON [dbo].[EmployeeDocument]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmployeeDocument_deletedById_idx] ON [dbo].[EmployeeDocument]([deletedById]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [EmployeeDocument_fileId_key] ON [dbo].[EmployeeDocument]([fileId]) WHERE ([fileId] IS NOT NULL);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Employee_deletedAt_createdAt_id_idx] ON [dbo].[Employee]([deletedAt], [createdAt] DESC, [id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Employee_lastName_firstName_idx] ON [dbo].[Employee]([lastName], [firstName]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Employee_departmentId_idx] ON [dbo].[Employee]([departmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Employee_positionId_idx] ON [dbo].[Employee]([positionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Employee_managerId_idx] ON [dbo].[Employee]([managerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Employee_createdById_idx] ON [dbo].[Employee]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Employee_deletedById_idx] ON [dbo].[Employee]([deletedById]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [Employee_avatarId_key] ON [dbo].[Employee]([avatarId]) WHERE ([avatarId] IS NOT NULL);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LeaveBalance_createdById_idx] ON [dbo].[LeaveBalance]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LeaveBalance_deletedById_idx] ON [dbo].[LeaveBalance]([deletedById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LeaveRequest_status_startDate_idx] ON [dbo].[LeaveRequest]([status], [startDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LeaveRequest_employeeId_startDate_idx] ON [dbo].[LeaveRequest]([employeeId], [startDate] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LeaveRequest_decidedById_idx] ON [dbo].[LeaveRequest]([decidedById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LeaveRequest_createdById_idx] ON [dbo].[LeaveRequest]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LeaveRequest_deletedById_idx] ON [dbo].[LeaveRequest]([deletedById]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [LeaveRequest_attachmentId_key] ON [dbo].[LeaveRequest]([attachmentId]) WHERE ([attachmentId] IS NOT NULL);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PerformanceReview_reviewerId_idx] ON [dbo].[PerformanceReview]([reviewerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PerformanceReview_createdById_idx] ON [dbo].[PerformanceReview]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PerformanceReview_deletedById_idx] ON [dbo].[PerformanceReview]([deletedById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Position_createdById_idx] ON [dbo].[Position]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OneTimeToken_expiresAt_idx] ON [dbo].[OneTimeToken]([expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Role_createdById_idx] ON [dbo].[Role]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Permission_createdById_idx] ON [dbo].[Permission]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [File_resourceName_resourceId_resourceField_idx] ON [dbo].[File]([resourceName], [resourceId], [resourceField]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [File_createdById_idx] ON [dbo].[File]([createdById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [File_deletedById_idx] ON [dbo].[File]([deletedById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [_EmployeeRolesRole_B_index] ON [dbo].[_EmployeeRolesRole]([B]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [_RolePermissionsPermission_B_index] ON [dbo].[_RolePermissionsPermission]([B]);

-- AddForeignKey
ALTER TABLE [dbo].[Compensation] ADD CONSTRAINT [Compensation_employeeId_fkey] FOREIGN KEY ([employeeId]) REFERENCES [dbo].[Employee]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Compensation] ADD CONSTRAINT [Compensation_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Compensation] ADD CONSTRAINT [Compensation_deletedById_fkey] FOREIGN KEY ([deletedById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Department] ADD CONSTRAINT [Department_headId_fkey] FOREIGN KEY ([headId]) REFERENCES [dbo].[Employee]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Department] ADD CONSTRAINT [Department_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmployeeDocument] ADD CONSTRAINT [EmployeeDocument_employeeId_fkey] FOREIGN KEY ([employeeId]) REFERENCES [dbo].[Employee]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmployeeDocument] ADD CONSTRAINT [EmployeeDocument_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[File]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmployeeDocument] ADD CONSTRAINT [EmployeeDocument_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmployeeDocument] ADD CONSTRAINT [EmployeeDocument_deletedById_fkey] FOREIGN KEY ([deletedById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Employee] ADD CONSTRAINT [Employee_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Employee] ADD CONSTRAINT [Employee_positionId_fkey] FOREIGN KEY ([positionId]) REFERENCES [dbo].[Position]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Employee] ADD CONSTRAINT [Employee_managerId_fkey] FOREIGN KEY ([managerId]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Employee] ADD CONSTRAINT [Employee_avatarId_fkey] FOREIGN KEY ([avatarId]) REFERENCES [dbo].[File]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Employee] ADD CONSTRAINT [Employee_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Employee] ADD CONSTRAINT [Employee_deletedById_fkey] FOREIGN KEY ([deletedById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveBalance] ADD CONSTRAINT [LeaveBalance_employeeId_fkey] FOREIGN KEY ([employeeId]) REFERENCES [dbo].[Employee]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveBalance] ADD CONSTRAINT [LeaveBalance_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveBalance] ADD CONSTRAINT [LeaveBalance_deletedById_fkey] FOREIGN KEY ([deletedById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveRequest] ADD CONSTRAINT [LeaveRequest_employeeId_fkey] FOREIGN KEY ([employeeId]) REFERENCES [dbo].[Employee]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveRequest] ADD CONSTRAINT [LeaveRequest_decidedById_fkey] FOREIGN KEY ([decidedById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveRequest] ADD CONSTRAINT [LeaveRequest_attachmentId_fkey] FOREIGN KEY ([attachmentId]) REFERENCES [dbo].[File]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveRequest] ADD CONSTRAINT [LeaveRequest_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LeaveRequest] ADD CONSTRAINT [LeaveRequest_deletedById_fkey] FOREIGN KEY ([deletedById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PerformanceReview] ADD CONSTRAINT [PerformanceReview_employeeId_fkey] FOREIGN KEY ([employeeId]) REFERENCES [dbo].[Employee]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PerformanceReview] ADD CONSTRAINT [PerformanceReview_reviewerId_fkey] FOREIGN KEY ([reviewerId]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PerformanceReview] ADD CONSTRAINT [PerformanceReview_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PerformanceReview] ADD CONSTRAINT [PerformanceReview_deletedById_fkey] FOREIGN KEY ([deletedById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Position] ADD CONSTRAINT [Position_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Position] ADD CONSTRAINT [Position_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Role] ADD CONSTRAINT [Role_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Permission] ADD CONSTRAINT [Permission_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[File] ADD CONSTRAINT [File_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[File] ADD CONSTRAINT [File_deletedById_fkey] FOREIGN KEY ([deletedById]) REFERENCES [dbo].[Employee]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[_EmployeeRolesRole] ADD CONSTRAINT [_EmployeeRolesRole_A_fkey] FOREIGN KEY ([A]) REFERENCES [dbo].[Employee]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_EmployeeRolesRole] ADD CONSTRAINT [_EmployeeRolesRole_B_fkey] FOREIGN KEY ([B]) REFERENCES [dbo].[Role]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_RolePermissionsPermission] ADD CONSTRAINT [_RolePermissionsPermission_A_fkey] FOREIGN KEY ([A]) REFERENCES [dbo].[Permission]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_RolePermissionsPermission] ADD CONSTRAINT [_RolePermissionsPermission_B_fkey] FOREIGN KEY ([B]) REFERENCES [dbo].[Role]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
