FROM node:22-alpine

RUN apk add --no-cache python3 make g++ git

RUN npm install -g milens@latest

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .

CMD ["npm", "start"]
