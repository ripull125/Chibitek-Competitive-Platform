FROM node:18-slim

WORKDIR /app

# Install system dependencies required by Chromium (Puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	fonts-liberation \
	libasound2 \
	libatk-bridge2.0-0 \
	libatk1.0-0 \
	libcups2 \
	libdrm2 \
	libgbm1 \
	libgtk-3-0 \
	libnspr4 \
	libnss3 \
	libx11-6 \
	libx11-xcb1 \
	libxcb1 \
	libxcomposite1 \
	libxdamage1 \
	libxext6 \
	libxfixes3 \
	libxrandr2 \
	libxkbcommon0 \
	libpangocairo-1.0-0 \
	libpango-1.0-0 \
	libxshmfence1 \
	wget \
	&& rm -rf /var/lib/apt/lists/*

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
