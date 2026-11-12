FROM node:24-alpine

RUN apk add --no-cache openssl

WORKDIR /app
ENV DATABASE_URL="file:./data/dev.db"

COPY package.json package-lock.json* ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY server/prisma server/prisma
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "run", "start", "--workspace=server"]
