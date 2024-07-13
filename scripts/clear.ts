import { Client } from 'oceanic.js';

const client = new Client({
  auth: `Bot ${process.env.DISCORD_TOKEN}`
});

await client.connect();

client.on('ready', async () => {
  await client.application
    .bulkEditGlobalCommands([])
    .then(() => {
      client.disconnect();
      process.exit(0);
    })
    .catch((error) => console.error(error));
});
