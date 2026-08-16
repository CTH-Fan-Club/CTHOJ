FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/src/server.mjs"]
