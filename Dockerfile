FROM node:20-alpine

WORKDIR /app

# Copia manifestos e instala dependências
COPY package*.json ./
RUN npm install --omit=dev

# Copia todo o código-fonte em JavaScript, HTML e CSS
COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/server.js"]