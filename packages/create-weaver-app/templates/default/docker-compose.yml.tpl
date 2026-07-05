services:
  postgres:
    image: postgres:18.4
    container_name: {{LOWER_NAME}}-postgres
    restart: unless-stopped
    healthcheck:
      test: "PGPASSWORD=$$POSTGRES_PASSWORD psql -U $$POSTGRES_USER -d $$POSTGRES_DB -c 'SELECT 1'"
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 5s
      start_interval: 5s
    ports:
      - "127.0.0.1:54312:5432"
    environment:
      POSTGRES_DB: "${DB_NAME}"
      POSTGRES_USER: "${DB_USER}"
      POSTGRES_PASSWORD: "${DB_PASSWORD}"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - {{LOWER_NAME}}

  redis:
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
      - "127.0.0.1:6380:6379"
    volumes:
      - redis-data:/data
    networks:
      - {{LOWER_NAME}}

  {{LOWER_NAME}}.migrations:
    image: {{LOWER_NAME}}:latest
    container_name: {{LOWER_NAME}}-migrations
    restart: no
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - .env
    command: [ "migrations" ]
    networks:
      - {{LOWER_NAME}}

  {{LOWER_NAME}}:
    image: {{LOWER_NAME}}:latest
    container_name: {{LOWER_NAME}}
    restart: unless-stopped
    build:
      context: .
    healthcheck:
      test: "wget -qO - http://127.0.0.1:3030/health/ready || exit 1"
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 5s
      start_interval: 5s
    depends_on:
      redis:
        condition: service_healthy
      {{LOWER_NAME}}.migrations:
        condition: service_completed_successfully
    ports:
      - "127.0.0.1:3030:3003"
    volumes:
      - ./storage:/usr/app/storage
      - ./logs:/usr/app/logs
    env_file:
      - .env
    networks:
      - {{LOWER_NAME}}

networks:
  {{LOWER_NAME}}:
    driver: bridge
    name: {{LOWER_NAME}}-network

volumes:
  postgres-data:
  redis-data:
