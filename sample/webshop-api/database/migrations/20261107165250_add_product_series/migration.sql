-- CreateTable
CREATE TABLE "ProductSeries" (
    "resourceId" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "price" INTEGER,
    "stock" INTEGER,
    "sold" INTEGER,

    CONSTRAINT "ProductSeries_pkey" PRIMARY KEY ("resourceId","time")
);

-- AddForeignKey
ALTER TABLE "ProductSeries" ADD CONSTRAINT "ProductSeries_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
