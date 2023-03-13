const { SlashCommandBuilder } = require('discord.js');
const { connectionMap, reconnectionList, save_document, joinVoice } = require('../utility')

module.exports = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join's your current voice channel."),
  async execute(interaction) {
    
    // useful data renames
    const userId = interaction.member.id;
    const guildId = interaction.member.guild.id;

    // determine if/where a matching active connection is stored
    let activeConnection = connectionMap.get(interaction.guildId);

    if (activeConnection) {
      activeConnection.connection.destroy();
      connectionMap.delete(interaction.guildId);

      for (let i = 0; i < reconnectionList.length; i++) {
        if (reconnectionList[i].guild.id === interaction.member.guild.id) {
          reconnectionList.splice(i, 1);
          break;
        }
      }
    }

    const voiceChannel = interaction.member?.voice.channel;
    joinVoice(voiceChannel, voiceChannel, interaction.channelId);

    reconnectionList.push({
      id: voiceChannel.id,
      guild: {
        id: voiceChannel.guild.id,
      },
      ttsChannel: interaction.channelId,
    });

    save_document(reconnectionList, "reconnection");

    interaction.reply({
      content: "Kef Voiced has joined the channel",
      ephemeral: false,
    });
  },
};
