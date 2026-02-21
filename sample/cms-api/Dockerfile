## 1. Install dependencies and build the application
FROM node:24.13.0-alpine AS build

# Install tools for building libraries on other platforms
RUN apk add build-base python3 py3-pip make gcc

# Create app directory
WORKDIR /usr/app

# Copy project files
COPY ../.. .

# Install NPM dependencies
RUN npm ci

# Generate Prisma client files
RUN npm run db:generate

# Build project
RUN npm run build


## 2. Setup server environment, copy build output and start the application script
FROM node:24.13.0-alpine AS deploy

# Install tools for building libraries on other platforms
RUN apk add build-base python3 py3-pip make gcc

# Create app directory
WORKDIR /usr/app

# Copy NPM package
COPY --from=build /usr/app/package*.json /usr/app/

# Copy node_modules directory
COPY --from=build /usr/app/node_modules /usr/app/node_modules

# Copy build files
COPY --from=build /usr/app/dist /usr/app/dist

# Copy Prisma config, database migrations, and schema file
COPY --from=build /usr/app/prisma.config.ts /usr/app/prisma.config.ts
COPY --from=build /usr/app/database/migrations /usr/app/database/migrations
COPY --from=build /usr/app/database/schema.prisma /usr/app/database/schema.prisma

# Copy config file/s
COPY --from=build /usr/app/appweaver*.json /usr/app/

# Copy start script
COPY --from=build /usr/app/start.sh /usr/app/start.sh

# Make start script executable
RUN chmod +x /usr/app/start.sh

# Create storage and logs directories
RUN mkdir storage logs

# Start container
ENTRYPOINT ["/usr/app/start.sh"]
