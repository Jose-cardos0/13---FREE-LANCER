require('dotenv').config();

module.exports = {
  webhookUrl: process.env.VOXUY_WEBHOOK_URL || 'https://sistema.voxuy.com/api/bc608452-e9b7-4213-9ee3-2ea983bd995e/webhooks/voxuy/transaction',
  apiToken: process.env.VOXUY_API_TOKEN || '8c01c758-2f53-42e5-82e7-9465185d7341',
  planId: process.env.VOXUY_PLAN_ID || '7e50b0e6-3554-4b10-84c4-0bc7d7',
  customEventId: process.env.VOXUY_CUSTOM_EVENT_ID ? parseInt(process.env.VOXUY_CUSTOM_EVENT_ID, 10) : null,
};
