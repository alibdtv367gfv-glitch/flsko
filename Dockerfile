FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7860

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && pnpm exec expo export --platform web --output-dir web-dist

EXPOSE 7860
CMD ["pnpm", "start"]
