## 1. Install dependencies, build the application, and keep the production dependencies
FROM oven/bun:1.4.2-alpine AS build

# Install tools for building the native modules
RUN apk add --no-cache build-base python3 make gcc

# Create app directory
WORKDIR /usr/app

# Copy project files
COPY . .

# Install NPM dependencies
RUN bun install --frozen-lockfile

# Build project
RUN bun run build

# Reinstall only the production dependencies, built for this platform
RUN rm -rf node_modules && bun install --frozen-lockfile --production


## 2. Setup server environment, copy build output and start the application script
FROM oven/bun:1.4.2-alpine AS deploy

# Run in the production environment unless the container sets NODE_ENV itself
ENV NODE_ENV=prod

# Create app directory
WORKDIR /usr/app

# Copy NPM package and the production dependencies
COPY --from=build /usr/app/package*.json /usr/app/
COPY --from=build /usr/app/node_modules /usr/app/node_modules

# Copy build files
COPY --from=build /usr/app/dist /usr/app/dist

# Copy public static files
COPY --from=build /usr/app/public /usr/app/public

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

# Create storage, logs, and data directories, writable by the application user
RUN mkdir storage logs data && chown bun:bun storage logs data

# Run the application as an unprivileged user
USER bun

# Start container
ENTRYPOINT ["/usr/app/start.sh"]
