const { SlashCommandBuilder } = require('discord.js');
const { save_document, load_document, cachedUserMap } = require('../utility.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('private')
      .setDescription('Links this server\'s voice connection to any DMs you send to the bot for private TTS.'),
    async execute(interaction) {
      console.log(interaction);
      let userId = interaction.user.id;
      let guildId = interaction.guildId;
      console.log(userId, guildId);
      
      let cached = false;
      // query the cache to get their full setting structure
      if (cachedUserMap.has(userId)) {
        cached = true;
        let setting = cachedUserMap.get(userId);
        // set privateServer setting to the originating guildID
        setting.global.privateServer = guildId;
        // save the new setting to the database
        await save_document(setting, userId);
      }
      // query the database if the user isn't cached
      if (cached === false) {
        const query = await load_document(userId);
        if (query) {
          // set privateSErver setting to the originating guildID
          query.global.privateServer = guildId;
          // cache the data since it wasn't cached before
          cachedUserMap.set(userId, query);
          // save the new setting to the database
          await save_document(query, userId);
        } else {
          // start with a fresh settings template
          const newSetting = makeDefaultSettings(userId);
          // assign the privateServer setting
          newSetting.global.privateServer = guildId;
          // cache the new setting and save to DB
          cachedUserMap.set(userId, newSetting);
          await save_document(query, userId);
        }
      }
      interaction.reply({
        content: 'Successfully set your current Discord server to your user ID for private TTS messages. You can now direct message KefVoiced and the message will be read aloud to a connected bot in the current server. This setting is persistent until you use /private again in another channel.',
        ephemeral: true,
      })
    }
};