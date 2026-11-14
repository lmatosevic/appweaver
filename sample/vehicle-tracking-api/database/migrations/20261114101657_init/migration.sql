-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('GeofenceEnter', 'GeofenceExit', 'RestrictedZone', 'Speeding', 'OffRoute', 'StopArrival', 'LowFuel', 'SignalLost');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('Info', 'Warning', 'Critical');

-- CreateEnum
CREATE TYPE "GeofenceKind" AS ENUM ('Depot', 'Customer', 'Restricted', 'SpeedZone');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('Active', 'Completed');

-- CreateEnum
CREATE TYPE "TripEndReason" AS ENUM ('IgnitionOff', 'SignalLost');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('Car', 'Van', 'Truck', 'Bus');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('Active', 'Maintenance', 'Retired');

-- CreateTable
CREATE TABLE "Alert" (
    "id" SERIAL NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "value" DOUBLE PRECISION,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "vehicleId" INTEGER NOT NULL,
    "tripId" INTEGER,
    "geofenceId" INTEGER,
    "acknowledgedById" INTEGER,
    "position" JSONB,
    "positionMinLng" DOUBLE PRECISION,
    "positionMinLat" DOUBLE PRECISION,
    "positionMaxLng" DOUBLE PRECISION,
    "positionMaxLat" DOUBLE PRECISION,
    "positionGeom" geometry(Point, 4326),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Geofence" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" "GeofenceKind" NOT NULL,
    "speedLimit" INTEGER,
    "description" VARCHAR(1000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "area" JSONB NOT NULL,
    "areaMinLng" DOUBLE PRECISION,
    "areaMinLat" DOUBLE PRECISION,
    "areaMaxLng" DOUBLE PRECISION,
    "areaMaxLat" DOUBLE PRECISION,
    "areaGeom" geometry(Polygon, 4326),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "Geofence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteStop" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 75,
    "routeId" INTEGER NOT NULL,
    "location" JSONB NOT NULL,
    "locationMinLng" DOUBLE PRECISION,
    "locationMinLat" DOUBLE PRECISION,
    "locationMaxLng" DOUBLE PRECISION,
    "locationMaxLat" DOUBLE PRECISION,
    "locationGeom" geometry(Point, 4326),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "corridorMeters" INTEGER NOT NULL DEFAULT 250,
    "path" JSONB NOT NULL,
    "pathMinLng" DOUBLE PRECISION,
    "pathMinLat" DOUBLE PRECISION,
    "pathMaxLng" DOUBLE PRECISION,
    "pathMaxLat" DOUBLE PRECISION,
    "pathGeom" geometry(LineString, 4326),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" SERIAL NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'Active',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "distanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pings" INTEGER NOT NULL DEFAULT 1,
    "offRoute" BOOLEAN NOT NULL DEFAULT false,
    "visitedStopIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "endReason" "TripEndReason",
    "vehicleId" INTEGER NOT NULL,
    "driverId" INTEGER,
    "routeId" INTEGER,
    "startPosition" JSONB NOT NULL,
    "startPositionMinLng" DOUBLE PRECISION,
    "startPositionMinLat" DOUBLE PRECISION,
    "startPositionMaxLng" DOUBLE PRECISION,
    "startPositionMaxLat" DOUBLE PRECISION,
    "startPositionGeom" geometry(Point, 4326),
    "endPosition" JSONB,
    "endPositionMinLng" DOUBLE PRECISION,
    "endPositionMinLat" DOUBLE PRECISION,
    "endPositionMaxLng" DOUBLE PRECISION,
    "endPositionMaxLat" DOUBLE PRECISION,
    "endPositionGeom" geometry(Point, 4326),
    "path" JSONB,
    "pathMinLng" DOUBLE PRECISION,
    "pathMinLat" DOUBLE PRECISION,
    "pathMaxLng" DOUBLE PRECISION,
    "pathMaxLat" DOUBLE PRECISION,
    "pathGeom" geometry(LineString, 4326),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32),
    "licenceCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "passwordHash" TEXT,
    "verifiedEmail" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumber" VARCHAR(16),
    "verifiedPhone" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "logoutAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "plate" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'Active',
    "fuelCapacity" DOUBLE PRECISION NOT NULL,
    "speedLimit" INTEGER NOT NULL DEFAULT 90,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "fuelLevel" DOUBLE PRECISION,
    "odometer" DOUBLE PRECISION,
    "ignition" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "driverId" INTEGER,
    "assignedRouteId" INTEGER,
    "position" JSONB,
    "positionMinLng" DOUBLE PRECISION,
    "positionMinLat" DOUBLE PRECISION,
    "positionMaxLng" DOUBLE PRECISION,
    "positionMaxLat" DOUBLE PRECISION,
    "positionGeom" geometry(Point, 4326),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" VARCHAR(255),
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "userId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimeToken" (
    "id" SERIAL NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneTimeToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_seeders" (
    "id" UUID NOT NULL,
    "checksum" VARCHAR(255) NOT NULL,
    "seederName" VARCHAR(511) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "logs" TEXT,

    CONSTRAINT "_seeders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSeries" (
    "resourceId" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "speed" DOUBLE PRECISION,
    "fuelLevel" DOUBLE PRECISION,
    "engineTemp" DOUBLE PRECISION,
    "batteryVoltage" DOUBLE PRECISION,
    "odometer" DOUBLE PRECISION,
    "ignition" BOOLEAN,

    CONSTRAINT "VehicleSeries_pkey" PRIMARY KEY ("resourceId","time")
);

-- CreateTable
CREATE TABLE "_ApiKeyRolesRole" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ApiKeyRolesRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ApiKeyPermissionsPermission" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ApiKeyPermissionsPermission_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_UserRolesRole" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_UserRolesRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_RolePermissionsPermission" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_RolePermissionsPermission_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Alert_vehicleId_occurredAt_idx" ON "Alert"("vehicleId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_severity_acknowledgedAt_occurredAt_idx" ON "Alert"("severity", "acknowledgedAt", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_tripId_idx" ON "Alert"("tripId");

-- CreateIndex
CREATE INDEX "Alert_geofenceId_idx" ON "Alert"("geofenceId");

-- CreateIndex
CREATE INDEX "Alert_acknowledgedById_idx" ON "Alert"("acknowledgedById");

-- CreateIndex
CREATE INDEX "Alert_createdById_idx" ON "Alert"("createdById");

-- CreateIndex
CREATE INDEX "Alert_positionMinLng_positionMinLat_idx" ON "Alert"("positionMinLng", "positionMinLat");

-- CreateIndex
CREATE INDEX "Alert_positionGeom_idx" ON "Alert" USING GIST ("positionGeom");

-- CreateIndex
CREATE INDEX "Geofence_kind_idx" ON "Geofence"("kind");

-- CreateIndex
CREATE INDEX "Geofence_createdById_idx" ON "Geofence"("createdById");

-- CreateIndex
CREATE INDEX "Geofence_areaMinLng_areaMinLat_idx" ON "Geofence"("areaMinLng", "areaMinLat");

-- CreateIndex
CREATE INDEX "Geofence_areaGeom_idx" ON "Geofence" USING GIST ("areaGeom");

-- CreateIndex
CREATE INDEX "RouteStop_createdById_idx" ON "RouteStop"("createdById");

-- CreateIndex
CREATE INDEX "RouteStop_locationMinLng_locationMinLat_idx" ON "RouteStop"("locationMinLng", "locationMinLat");

-- CreateIndex
CREATE INDEX "RouteStop_locationGeom_idx" ON "RouteStop" USING GIST ("locationGeom");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_routeId_sequence_key" ON "RouteStop"("routeId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Route_code_key" ON "Route"("code");

-- CreateIndex
CREATE INDEX "Route_createdById_idx" ON "Route"("createdById");

-- CreateIndex
CREATE INDEX "Route_pathMinLng_pathMinLat_idx" ON "Route"("pathMinLng", "pathMinLat");

-- CreateIndex
CREATE INDEX "Route_pathGeom_idx" ON "Route" USING GIST ("pathGeom");

-- CreateIndex
CREATE INDEX "Trip_vehicleId_startedAt_idx" ON "Trip"("vehicleId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "Trip_status_startedAt_idx" ON "Trip"("status", "startedAt");

-- CreateIndex
CREATE INDEX "Trip_driverId_idx" ON "Trip"("driverId");

-- CreateIndex
CREATE INDEX "Trip_routeId_idx" ON "Trip"("routeId");

-- CreateIndex
CREATE INDEX "Trip_createdById_idx" ON "Trip"("createdById");

-- CreateIndex
CREATE INDEX "Trip_startPositionMinLng_startPositionMinLat_idx" ON "Trip"("startPositionMinLng", "startPositionMinLat");

-- CreateIndex
CREATE INDEX "Trip_startPositionGeom_idx" ON "Trip" USING GIST ("startPositionGeom");

-- CreateIndex
CREATE INDEX "Trip_endPositionMinLng_endPositionMinLat_idx" ON "Trip"("endPositionMinLng", "endPositionMinLat");

-- CreateIndex
CREATE INDEX "Trip_endPositionGeom_idx" ON "Trip" USING GIST ("endPositionGeom");

-- CreateIndex
CREATE INDEX "Trip_pathMinLng_pathMinLat_idx" ON "Trip"("pathMinLng", "pathMinLat");

-- CreateIndex
CREATE INDEX "Trip_pathGeom_idx" ON "Trip" USING GIST ("pathGeom");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdById_idx" ON "User"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_deviceId_key" ON "Vehicle"("deviceId");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE INDEX "Vehicle_lastSeenAt_idx" ON "Vehicle"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Vehicle_driverId_idx" ON "Vehicle"("driverId");

-- CreateIndex
CREATE INDEX "Vehicle_assignedRouteId_idx" ON "Vehicle"("assignedRouteId");

-- CreateIndex
CREATE INDEX "Vehicle_createdById_idx" ON "Vehicle"("createdById");

-- CreateIndex
CREATE INDEX "Vehicle_positionMinLng_positionMinLat_idx" ON "Vehicle"("positionMinLng", "positionMinLat");

-- CreateIndex
CREATE INDEX "Vehicle_positionGeom_idx" ON "Vehicle" USING GIST ("positionGeom");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_createdById_idx" ON "ApiKey"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeToken_tokenHash_key" ON "OneTimeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OneTimeToken_expiresAt_idx" ON "OneTimeToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Role_createdById_idx" ON "Role"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE INDEX "Permission_createdById_idx" ON "Permission"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "_seeders_seederName_key" ON "_seeders"("seederName");

-- CreateIndex
CREATE INDEX "_ApiKeyRolesRole_B_index" ON "_ApiKeyRolesRole"("B");

-- CreateIndex
CREATE INDEX "_ApiKeyPermissionsPermission_B_index" ON "_ApiKeyPermissionsPermission"("B");

-- CreateIndex
CREATE INDEX "_UserRolesRole_B_index" ON "_UserRolesRole"("B");

-- CreateIndex
CREATE INDEX "_RolePermissionsPermission_B_index" ON "_RolePermissionsPermission"("B");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "Geofence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geofence" ADD CONSTRAINT "Geofence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_assignedRouteId_fkey" FOREIGN KEY ("assignedRouteId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSeries" ADD CONSTRAINT "VehicleSeries_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiKeyRolesRole" ADD CONSTRAINT "_ApiKeyRolesRole_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiKeyRolesRole" ADD CONSTRAINT "_ApiKeyRolesRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiKeyPermissionsPermission" ADD CONSTRAINT "_ApiKeyPermissionsPermission_A_fkey" FOREIGN KEY ("A") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApiKeyPermissionsPermission" ADD CONSTRAINT "_ApiKeyPermissionsPermission_B_fkey" FOREIGN KEY ("B") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRolesRole" ADD CONSTRAINT "_UserRolesRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRolesRole" ADD CONSTRAINT "_UserRolesRole_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RolePermissionsPermission" ADD CONSTRAINT "_RolePermissionsPermission_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RolePermissionsPermission" ADD CONSTRAINT "_RolePermissionsPermission_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
