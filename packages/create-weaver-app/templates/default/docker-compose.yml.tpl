services:
{{DATABASE_DOCKER_SERVICE}}  redis:
    image: redis:7.4.9
    container_name: {{LOWER_NAME}}-redis
    restart: unless-stopped
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 5s
      start_interval: 5s
    ports:
      - "127.0.0.1:6378:6379"
    volumes:
      - redis-data:/data
    networks:
      - {{LOWER_NAME}}

  {{LOWER_NAME}}.migrations:
    image: {{LOWER_NAME}}:latest
    container_name: {{LOWER_NAME}}-migrations
    restart: no
    build:
      context: .
{{DATABASE_DOCKER_MIGRATE_DEPENDS}}    env_file:
      - .env
    command: [ "migrations" ]
{{DATABASE_DOCKER_SQLITE_VOLUMES}}    networks:
      - {{LOWER_NAME}}

  {{LOWER_NAME}}.seed:
    image: {{LOWER_NAME}}:latest
    container_name: {{LOWER_NAME}}-seed
    restart: no
    build:
      context: .
    depends_on:
      {{LOWER_NAME}}.migrations:
        condition: service_completed_successfully
    env_file:
      - .env
    command: [ "seed" ]
{{DATABASE_DOCKER_SQLITE_VOLUMES}}    networks:
      - {{LOWER_NAME}}

  {{LOWER_NAME}}:
    image: {{LOWER_NAME}}:latest
    container_name: {{LOWER_NAME}}
    restart: unless-stopped
    build:
      context: .
    healthcheck:
      test: "wget -qO - http://127.0.0.1:{{PORT}}/health/ready || exit 1"
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 5s
      start_interval: 5s
    depends_on:
      redis:
        condition: service_healthy
      {{LOWER_NAME}}.seed:
        condition: service_completed_successfully
    ports:
      - "127.0.0.1:{{PORT}}:{{PORT}}"
    volumes:
      - ./storage:/usr/app/storage
      - ./logs:/usr/app/logs{{DATABASE_DOCKER_APP_VOLUME}}
    env_file:
      - .env
    networks:
      - {{LOWER_NAME}}

networks:
  {{LOWER_NAME}}:
    driver: bridge
    name: {{LOWER_NAME}}-network

volumes:
{{DATABASE_DOCKER_NAMED_VOLUME}}  redis-data:
