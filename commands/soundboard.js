const { SlashCommandBuilder } = require('discord.js');
const { connectionMap, queueSoundboard, MessageEmbed } = require('../utility.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('soundboard')
      .setDescription('This command is currently under a rewrite'),
    async execute(interaction) {
        interaction.reply({
            content: 'This feature is currently being rewritten. Please be patient',
            ephemeral: true,
        })
    //     console.log('Soundboard command fired');
    //     let activeConnection = connectionMap.get(interaction.guildId);
    //   if (!activeConnection) {
    //     interaction.reply({
    //       content: "Connect the bot to voice and try again!",
    //       ephemeral: true,
    //     });
    //     return;
    //   }

    //   if (!interaction.member?.voice.channel) {
    //     interaction.reply({
    //       content: 'Join voice and try again!',
    //       ephemeral: true,
    //     });
    //     return;
    //   }

    //   // filter so bot reactions aren't collected
    //   let filter = (reaction, user) => {
    //     return user.id != "941537585170382928" && user.id != "941542196337844245" && user.id != "996208482455928913";
    //   };

    //   // define data tracking
    //   let sbReactCounter = 0;

    //   let sbMessages = [];
    //   let collectorReactions = [];

    //   // define soundboard embedded message
    //   const sb = new MessageEmbed()
    //     .setTitle("Kef Voiced Soundboard")
    //     .setDescription(
    //       "The following emoji's will play the associated audio clip in the channel you performed the /soundboard command",
    //     )
    //     .addFields({
    //       name: "Click here for the soundboard key",
    //       value:
    //         "[Click me!](https://docs.google.com/spreadsheets/d/1eYwxOGZScgQpLbsAtN5fP0WfLq9VT6jnxzj6-p5QPqE/edit#gid=0)",
    //       inline: true,
    //     });

    //   await interaction.user.send({ embeds: [sb] }).then(() => interaction.reply({
    //     content: 'Sending you the soundboard via Direct Message',
    //     ephemeral: true
    //     })
    //     ).catch(() => interaction.reply({
    //     content: 'Something went wrong :(',
    //     ephemeral: true
    //     })
    //     )

    //   for (let key in sbKey) {
    //     if (sbReactCounter == 0) {
    //       sbMessages.push(
    //         await interaction.user.send({ content: "-", fetchReply: true })
    //       );
    //       collectorReactions.push(
    //         sbMessages[sbMessages.length - 1].createReactionCollector({
    //           filter,
    //           time: 86_400_000,
    //         })
    //       );
    //       collectorReactions[collectorReactions.length - 1].on(
    //         "collect",
    //         (reaction, user) => {
    //           queueSoundboard(reaction, interaction, guildId);
    //         }
    //       );
    //     }

    //     await sbMessages[sbMessages.length - 1].react(key);

    //     sbReactCounter++;

    //     if (sbReactCounter == 19) {
    //       sbReactCounter = 0;
    //     }
    //   }
    }
};