FROM node:20-alpine AS builder
WORKDIR /app

# Install all dependencies (including dev) for TypeScript build
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript to JavaScript
COPY . .
RUN npx tsc --outDir dist --rootDir .
RUN if [ -d uploads ]; then mkdir -p dist/uploads && cp -R uploads/. dist/uploads/; fi

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled app from builder
COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server.js"]
