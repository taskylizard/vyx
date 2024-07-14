import { Embed, defineSlashCommand } from "#framework";
import { sample } from "@antfu/utils";

const responses = [
  "Most likely",
  "It is certain",
  "It is decidedly so",
  "Without a doubt",
  "Definitely",
  "You may rely on it",
  "As I see it, yes",
  "Outlook good",
  "Yes",
  "Maybe",
  "Signs point to yes",
  "Reply hazy, try again",
  "Ask again later",
  "Better not tell you now",
  "Cannot predict now",
  "Concentrate and ask again",
  "Don't count on it,",
  "My reply is no",
  "My sources say no",
  "Outlook not so good",
  "Very doubtful",
];

export default defineSlashCommand({
  name: "8ball",
  description: "Ask the magic 8ball.",
  options: [
    {
      name: "question",
      type: "string",
      description: "Your question.",
      required: true,
    },
  ] as const,
  async run(ctx) {
    const { question } = ctx.options;

    const embed = new Embed()
      .setDescription(question)
      .setColor(ctx.colors.BLUE)
      .addFields([{ name: "Response", value: sample(responses, 1)[0] }]);

    return await ctx.reply([embed]);
  },
});
