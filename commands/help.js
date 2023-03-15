const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('help')
      .setDescription('I\'m a Helper Template for now!'),
    async execute(interaction) {
        //Hi, I'm a helper template for now!
        return;
    }
};