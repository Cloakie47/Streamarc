import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets"

export const circleWalletsAdapter = createCircleWalletsAdapter({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
})
