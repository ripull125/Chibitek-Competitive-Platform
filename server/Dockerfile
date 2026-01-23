FROM node:18-slim

WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
