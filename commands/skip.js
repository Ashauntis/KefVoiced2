const { SlashCommandBuilder } = require('discord.js');
const { connectionMap } = require('../utility.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Skip the current audio clip'),
    async execute(interaction) {
        let activeConnection = connectionMap.get(interaction.guildId);
        let guildId = interaction.guildId;

        try {
            console.log(`Skipping current audio file on guild ${guildId}`);
            activeConnection.playing = false;
    
            // remove the current audio file from the queue
    
            if (activeConnection.queue.length != 0) {
              if (activeConnection.queue[0].soundboard === false) {
                fs.unlinkSync(activeConnection.queue[0].path);
                activeConnection.queue.shift();
              }
            }
    
            // if the queue is now empty then add a moment of silence to the queue to halt the prior broadcast. if the queue is NOT empty then they will naturally disrupt playback of the audio file being played.
    
            if (activeConnection.queue.length === 0) {
              activeConnection.queue.push({
                id: guildId,
                path: 'audio/silence.ogg',
                message: null,
                soundboard: true,
              });
            }
    
            interaction.reply({
              content: `Skipping the current audio clip`,
              ephemeral: true
            })
    
          } catch (err) {
            console.log(err);
          }
    }
};