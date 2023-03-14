const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('setvoice')
      .setDescription('Choose a voice from the list of supported voices (/listvoice).')
      .addStringOption(option =>
		option.setName('names')
			.setDescription('Supported Names')
			.setRequired(true)
			.addChoices(
				{ name: 'Salli', value: 'Salli' },
				{ name: 'Matthew', value: 'Matthew' },
				{ name: 'Kimberly', value: 'Kimberly' },
                { name: 'Kendra', value: 'Kendra' },
                { name: 'Justin', value: 'Justin' },
                { name: 'Joey', value: 'Joey' },
                { name: 'Joanna', value: 'Joanna' },
                { name: 'Ivy', value: 'Ivy' },
                { name: 'Ruth', value: 'Ruth' },
                { name: 'Stephen', value: 'Stephen' },
			)
        ),
    async execute(interaction) {
        interaction.reply({content: 'Reminder that this isn\'t done yet!', ephemeral: true});
        return;
    }
};