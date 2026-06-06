# 松松记账 后端镜像（多阶段构建）
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3001
# 启动即建表（IF NOT EXISTS，幂等）；用户数据在注册时按需播种
CMD ["node", "dist/server.js"]
