const { SlashCommandBuilder } = require('discord.js');
const { load_document, save_document, makeDefaultSettings, cachedUserMap } = require('../utility.js');

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
        const userId = interaction.user.id;
        const voice = interaction.options.getString('names');

        let query = await load_document(userId);

        if (query) {
            query.global.voice = voice;
            cachedUserMap.set(userId, query);
            save_document(query, userId);
        } else {
            let newSetting = makeDefaultSettings(userId);
            newSetting.global.voice = voice;
            cachedUserMap.set(userId, newSetting);
            save_document(newSetting, userId);
        }
        interaction.reply({
            content: `Setting your voice to ${voice}`,
            ephemeral: true
        })
    }
};