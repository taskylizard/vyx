import { ApplicationCommandOptionTypes } from 'oceanic.js';
import {
  Embed,
  type ShopItemConstructor,
  defineSlashCommand
} from '#framework';

export default defineSlashCommand({
  name: 'economy',
  moduleId: 'ECONOMY',
  description: 'Server economy.',
  guildOnly: true,
  subcommands: [
    {
      name: 'currency',
      description: 'Set the server economy currency.',
      requiredPermissions: ['MANAGE_GUILD'],
      options: [
        {
          name: 'currency',
          description: 'Your currency, can be a emoji or text.',
          required: true,
          type: ApplicationCommandOptionTypes.STRING
        }
      ],
      async run(ctx) {
        const value = ctx.options.getString('currency', true);

        await ctx.client.prisma.config.update({
          where: {
            guildId: BigInt(ctx.interaction.guildID!)
          },
          data: {
            currency: value
          }
        });

        return await ctx.reply(`Successfully set currency to ${value}.`);
      }
    },
    {
      name: 'balance',
      description: 'Show your current balance.',
      async run(ctx) {
        const balance = await ctx.client.modules.economy.get(
          ctx.interaction.guildID!,
          ctx.interaction.user
        );
        const currency = await ctx.client.modules.economy.getCurrency(
          ctx.interaction.guildID!
        );

        const embed = new Embed().setTitle('Balance').addFields([
          {
            name: 'Wallet',
            value: `${balance?.walletBal} ${currency}`
          },
          { name: 'Bank', value: `${balance?.bankBal} ${currency}` }
        ]);

        return ctx.reply([embed]);
      }
    },
    {
      name: 'deposit',
      description: 'Deposit your money in the bank.',
      options: [
        {
          name: 'amount',
          description: 'The amount to deposit',
          required: true,
          type: ApplicationCommandOptionTypes.INTEGER
        }
      ],
      async run(ctx) {
        const toDeposit = ctx.options.getInteger('amount', true);
        const balance = await ctx.client.modules.economy.get(
          ctx.interaction.guildID!,
          ctx.interaction.user
        );

        if (balance!.walletBal < toDeposit) {
          return await ctx.reply("You don't have that much money!");
        }

        await ctx.reply(
          `Successfully deposited ${toDeposit} ${await ctx.client.modules.economy.getCurrency(
            ctx.interaction.guildID!
          )} to your bank!`
        );

        await ctx.client.modules.economy.deposit(
          ctx.interaction.guildID!,
          ctx.interaction.user,
          toDeposit
        );
      }
    },
    {
      name: 'crime',
      description: 'Commit heinous crimes.',
      cooldown: 3000,
      async run(ctx) {
        const currency = await ctx.client.modules.economy.getCurrency(
          ctx.interaction.guildID!
        );
        const random = Math.floor(Math.random() * 10);

        if (random > 7) {
          const money = Math.floor(Math.random() * 200) + 50;

          await ctx.reply(
            `The police caught you! You got fined ${money} ${currency}`
          );

          return await ctx.client.modules.economy.subtract(
            ctx.interaction.guildID!,
            ctx.interaction.user,
            money
          );
        }

        const money = Math.floor(Math.random() * 200) + 100;

        const messages = [
          'You robbed a bank! You got ',
          "You stole someone's wallet! You found ",
          'You broke into a house and stole '
        ];

        const description = `${
          messages[Math.floor(Math.random() * 3)]
        }${money} ${currency}`;

        const embed = new Embed()
          .setTitle('You committed a crime!')
          .setDescription(description);

        await ctx.reply([embed]);
        return await ctx.client.modules.economy.add(
          ctx.interaction.guildID!,
          ctx.interaction.user,
          money
        );
      }
    },
    {
      name: 'rob',
      description: 'Rob someone of their money.',
      options: [
        {
          name: 'user',
          description: 'The person you wanna rob.',
          required: true,
          type: ApplicationCommandOptionTypes.USER
        }
      ],
      async run(ctx) {
        const user = ctx.options.getUser('user', true);

        if (user.id === ctx.user.id) {
          return ctx.reply("You can't rob yourself.");
        }

        if (!ctx.guild?.members.get(user.id)) {
          return ctx.reply('That user could not be found.');
        }

        const userBalance = await ctx.client.modules.economy.get(
          ctx.interaction.guildID!,
          user
        );
        const robberBalance = await ctx.client.modules.economy.get(
          ctx.interaction.guildID!,
          ctx.interaction.user
        );

        const earnedPercent = Math.round(Math.random() * 20) + 20;
        const earned = Math.round(
          userBalance!.walletBal * (earnedPercent / 100)
        );
        const chance = Math.random() * 100;
        const currency = await ctx.client.modules.economy.getCurrency(
          ctx.interaction.guildID!
        );

        if (userBalance!.walletBal < 0) {
          return ctx.reply(
            "You tried to rob them, but they didn't have any money in their wallet!"
          );
        }

        if (chance > 40) {
          const lost = Math.round(
            (robberBalance!.bankBal + robberBalance!.walletBal) * (earned / 100)
          );
          await ctx.client.modules.economy.subtract(
            ctx.interaction.guildID!,
            ctx.interaction.user,
            lost
          );

          return ctx.reply(
            `You tried to rob them, but they caught you! You got fined ${lost} ${currency}`
          );
        }

        const embed = new Embed()
          .setTitle(`You robbed ${user.username}`)
          .setDescription(
            `You took their wallet! You got ${earned} ${currency}`
          );

        await ctx.client.modules.economy.add(
          ctx.interaction.guildID!,
          ctx.interaction.user,
          earned
        );
        await ctx.client.modules.economy.subtract(
          ctx.interaction.guildID!,
          ctx.interaction.user,
          earned
        );

        return ctx.reply([embed]);
      }
    },
    {
      name: 'slut',
      description: 'Get money by being a slut!',
      async run(ctx) {
        const money = Math.floor(Math.random() * 200 + 50);

        const embed = new Embed()
          .setTitle('You worked as a slut!')
          .setDescription(
            `You worked as a slut for 2 hours! You earned ${money} ${await ctx.client.modules.economy.getCurrency(
              ctx.interaction.guildID!
            )}`
          );
        await ctx.client.modules.economy.add(
          ctx.interaction.guildID!,
          ctx.interaction.user,
          money
        );

        return ctx.reply([embed]);
      }
    },
    {
      name: 'work',
      description: 'Get money from working!',
      async run(ctx) {
        const random = Math.floor(Math.random() * 3);
        const money = Math.floor(Math.random() * 150 + 50);

        const messages = [
          'You coded a discord bot from a commission! You were paid ',
          "You worked at McDonald's and earned ",
          'You coded a website for a small company! They paid you '
        ];

        const description = `${
          messages[random]
        }${money} ${await ctx.client.modules.economy.getCurrency(ctx.interaction.guildID!)}`;

        const embed = new Embed()
          .setTitle('You worked!')
          .setDescription(description);

        await ctx.client.modules.economy.add(
          ctx.interaction.guildID!,
          ctx.interaction.user,
          money
        );
        return ctx.reply([embed]);
      }
    },
    {
      name: 'withdraw',
      description: 'Withdraw money from your wallet.',
      options: [
        {
          name: 'amount',
          description: 'The amount to be withdrawn.',
          required: true,
          type: ApplicationCommandOptionTypes.INTEGER,
          minValue: 1
        }
      ],
      async run(ctx) {
        const toWithdraw = ctx.options.getInteger('amount', true);
        const balance = await ctx.client.modules.economy.get(
          ctx.interaction.guildID!,
          ctx.interaction.user
        );

        if (balance!.bankBal < toWithdraw) {
          return ctx.reply("You don't have enough balance in your bank!");
        }

        await ctx.reply(
          `Successfully withdrew ${toWithdraw} ${await ctx.client.modules.economy.getCurrency(
            ctx.interaction.guildID!
          )} from your bank!`
        );

        await ctx.client.modules.economy.withdraw(
          ctx.interaction.guildID!,
          ctx.interaction.user,
          toWithdraw
        );
      }
    },
    {
      name: 'shop',
      description: 'Server shop commands.',
      subcommands: [
        {
          name: 'buy',
          description: 'Buy a shop item.',
          options: [
            {
              name: 'item',
              description: 'Name of the item.',
              type: ApplicationCommandOptionTypes.STRING,
              required: true
            }
          ],
          async run(ctx) {
            const item = ctx.options.getString('item', true);
            const itemObj = await ctx.client.modules.shop.get(
              ctx.interaction.guildID!,
              item
            );
            const user = await ctx.client.modules.economy.get(
              ctx.interaction.guildID!,
              ctx.interaction.user
            );

            if (!itemObj) {
              return await ctx.reply(
                'Shop item could not be found. Check items using `/shop list` .'
              );
            }

            if (itemObj.price > user!.walletBal) {
              return await ctx.reply("You don't have that much money!");
            }

            await ctx.reply(
              `Successfully bought ${itemObj.name} for ${
                itemObj.price
              } ${await ctx.client.modules.economy.getCurrency(ctx.interaction.guildID!)}`
            );

            if (itemObj.role) {
              const role = ctx.interaction.guild!.roles.get(
                itemObj.role.toString()
              );

              if (role) {
                await ctx.client.rest.guilds.addMemberRole(
                  ctx.interaction.guildID!,
                  ctx.interaction.user.id,
                  role.id,
                  `Purchased the ${itemObj.name} shop item.`
                );
              }
            }

            return await ctx.client.modules.economy.subtract(
              ctx.interaction.guildID!,
              ctx.interaction.user,
              itemObj.price
            );
          }
        },
        {
          name: 'list',
          description: 'Show your server shop.',
          async run(ctx) {
            const list = await ctx.client.modules.shop.list(
              ctx.interaction.guildID!
            );
            const embed = new Embed().setTitle('Shop');

            const currency = await ctx.client.modules.economy.getCurrency(
              ctx.interaction.guildID!
            );

            if (list.length) {
              list.forEach((item) => {
                embed.addFields([
                  {
                    name: `${item.name} - ${item.price} ${currency}`,
                    value: item.description
                  }
                ]);
              });
            } else {
              embed.setDescription('No items have been added.');
            }

            return ctx.reply([embed]);
          }
        },
        {
          name: 'delete',
          description: 'Delete a shop item.',
          options: [
            {
              name: 'item',
              description: 'Name of the item.',
              required: true,
              type: ApplicationCommandOptionTypes.STRING
            }
          ],
          async run(ctx) {
            const name = ctx.options.getString('item', true);
            const itemObj = await ctx.client.modules.shop.get(
              ctx.interaction.guildID!,
              name
            );

            if (!itemObj) {
              await ctx.client.application.getGlobalCommands();
              return await ctx.reply(
                'Shop item could not be found. Check items using `/shop list` .'
              );
            }

            if (!ctx.interaction.memberPermissions?.has('MANAGE_GUILD')) {
              return await ctx.reply(
                "You don't have the permissions needed to create a item! Needed permissions: Manage guild"
              );
            }

            await ctx.reply('Successfully deleted the item.');

            return await ctx.client.modules.shop.delete(
              ctx.interaction.guildID!,
              name
            );
          }
        },
        {
          name: 'create',
          description: 'Create a new shop item.',
          options: [
            {
              name: 'name',
              description: 'Name of the item.',
              required: true,
              type: ApplicationCommandOptionTypes.STRING,
              minLength: 5,
              maxLength: 20
            },
            {
              name: 'description',
              description: 'Description of the item.',
              required: true,
              type: ApplicationCommandOptionTypes.STRING,
              maxLength: 50,
              minLength: 5
            },
            {
              name: 'price',
              description: 'Price of the item.',
              required: true,
              type: ApplicationCommandOptionTypes.INTEGER,
              minValue: 1
            },
            {
              name: 'role',
              description: 'A role reward on purchase.',
              type: ApplicationCommandOptionTypes.ROLE
            }
          ],
          async run(ctx) {
            const name = ctx.options.getString('name', true);
            const description = ctx.options.getString('description', true);
            const price = ctx.options.getInteger('price', true);
            const role = ctx.options.getRole('role');

            const obj: ShopItemConstructor = {
              name,
              description,
              price,
              guildId: BigInt(ctx.interaction.guildID!)
            };

            if (role) {
              obj.role = BigInt(role.id);
            }

            if (!ctx.interaction.memberPermissions!.has('MANAGE_GUILD')) {
              return await ctx.reply(
                "You don't have the permissions needed to create a item! Needed permissions: Manage guild"
              );
            }

            const existingItem = await ctx.client.modules.shop.get(
              ctx.interaction.guildID!,
              name
            );

            if (existingItem) {
              return await ctx.reply('That item already exists.');
            }

            const embed = new Embed()
              .setTitle('Successfully created a item!')
              .addFields([
                { name: 'Name', value: name },
                { name: 'Description', value: description },
                {
                  name: 'Price',
                  value: `${price} ${await ctx.client.modules.economy.getCurrency(
                    ctx.interaction.guildID!
                  )}`
                }
              ]);

            await ctx.reply([embed]);
            return await ctx.client.modules.shop.add(obj);
          }
        }
      ]
    }
  ]
});
