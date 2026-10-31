services:
  {{LOWER_NAME}}:
    image: {{LOWER_NAME}}:latest
    container_name: {{LOWER_NAME}}
    restart: unless-stopped
    build:
      context: .
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
