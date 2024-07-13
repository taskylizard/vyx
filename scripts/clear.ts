import { Client } from 'oceanic.js';

const client = new Client({
  auth: `Bot ${process.env.DISCORD_TOKEN}`
});

await client.connect();

client.on('ready', async () => {
  await client.application
    .bulkEditGlobalCommands([])
    .then(async () => {
      for await (const [_, guild] of client.guilds) {
        await client.application.bulkEditGuildCommands(guild.id, []);
      }
    })
    .catch((error) => console.error(error))
    .finally(() => {
      client.disconnect();
      process.exit(0);
    });
});
