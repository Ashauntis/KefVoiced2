const { SlashCommandBuilder } = require('discord.js');
const { polly } = require('../utility.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('listvoices')
      .setDescription('List the voices currently supported by Amazon Polly'),
    async execute(interaction) {
        polly.describeVoices(
            { LanguageCode: "en-US" },
            function (err, data) {
              if (err) {
                console.log(err, err.stack);
              } else {
                response = "The currently supported voices include ";
    
                let voicesList = [];
                data.Voices.forEach((voice) => {
                  if(voice.Name === 'Kevin') return;
                  voicesList.push(`${voice.Name} (${voice.Gender})`);
                })
                let lastVoice = voicesList.pop();
                response += voicesList.join(', ') + " and " + lastVoice + ".";
    
                interaction.reply({ content: response, ephemeral: true });
              }
            }
          );
    }
};