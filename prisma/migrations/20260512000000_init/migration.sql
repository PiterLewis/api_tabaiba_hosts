-- CreateEnum
CREATE TYPE "EstadoPropietario" AS ENUM ('ACTIVO', 'BAJA');

-- CreateEnum
CREATE TYPE "EstadoPiso" AS ENUM ('ACTIVO', 'PAUSADO', 'BAJA');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Propietario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "notas" TEXT,
    "estado" "EstadoPropietario" NOT NULL DEFAULT 'ACTIVO',
    "fechaAlta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Propietario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Piso" (
    "id" TEXT NOT NULL,
    "propietarioId" TEXT NOT NULL,
    "nombreInterno" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "zona" TEXT NOT NULL,
    "numDormitorios" INTEGER NOT NULL,
    "numHuespedesMax" INTEGER NOT NULL,
    "airbnbListingUrl" TEXT,
    "airbnbIcalUrl" TEXT,
    "bookingIcalUrl" TEXT,
    "instruccionesCheckIn" TEXT,
    "wifiNombre" TEXT,
    "wifiPassword" TEXT,
    "codigoLockbox" TEXT,
    "comisionPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "fechaInicioGestion" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoPiso" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Piso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "Piso_propietarioId_idx" ON "Piso"("propietarioId");

-- CreateIndex
CREATE INDEX "Piso_estado_idx" ON "Piso"("estado");

-- AddForeignKey
ALTER TABLE "Piso" ADD CONSTRAINT "Piso_propietarioId_fkey" FOREIGN KEY ("propietarioId") REFERENCES "Propietario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

