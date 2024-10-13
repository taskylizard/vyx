import { definePlugin } from '#framework';

const SUBMIT_CHANNEL_ID = '1276863566397571223';

export default definePlugin({
  name: 'privateersclub',
  onLoad: (client) => {
    client.on('messageCreate', async (message) => {
      if (message.channelID === SUBMIT_CHANNEL_ID) {
        await message.startThread({
          name: 'Discussion 🧵'
        });
      }
    });
  }
});
