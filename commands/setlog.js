const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('setlog')
      .setDescription('This feature is a work in progress'),
    async execute(interaction) {
        interaction.reply({
            content: 'While I appreciate curiosity, this feature isn\'t implemented yet. Sorry!',
            ephemeral: true,
        })
        return;
    }
};