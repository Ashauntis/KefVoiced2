// Copyright (C) 2022 by Kayla Grey + Jared De Blander

// Environment Variables
require("dotenv").config();

// Dependencies
const fs = require("fs");
const { join } = require("path");
const { Client, Intents, MessageEmbed } = require("discord.js");
const {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const {
  SlashCommandRoleOption,
  EmbedAssertions,
  underscore,
} = require("@discordjs/builders");

// Load any additional JS files
const utility = require("./utility.js");

// Extend string class to include a capitalize method
String.prototype.capitalize = function () {
  return this.charAt(0).toUpperCase() + this.slice(1);
};

// Create a new client instance
const client = new Client({
  intents: [
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_PRESENCES,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILDS,
  ],

  partials: ["MESSAGE", "CHANNEL", "REACTION"],
});

// data tracking

const activeConnections = utility.activeConnections;
const reconnectionList = utility.reconnectionList;
const polly = utility.polly;
let cachedUserMap = new Map();

client.once("ready", () => {
  console.log("Ready!");
});
// console.log(process.env.token);
client.login(process.env.token);
setInterval(utility.playQueue, 1000);

// listen for slash commands from the discord client

client.on("interactionCreate", async (interaction) => {
  // useful data renames
  const userId = interaction.member.id;
  const guildId = interaction.member.guild.id;

  // determine if/where a matching active connection is stored
  let idx = null;

  for (let i = 0; i < activeConnections.length; i++) {
    if (activeConnections[i].guildId === interaction.guildId) {
      idx = i;
      console.log(
        `Matching active connection found for interaction (${interaction.commandName}) on server ${interaction.guildId}.`
      );
      break;
    }
  }

  // function key for each slash command
  slashCommands = {
    join: () => {
      if (idx != null) {
        activeConnections[idx].connection.destroy();
        activeConnections.splice(idx, 1);

        for (let i = 0; i < reconnectionList.length; i++) {
          if (reconnectionList[i].guild.id === interaction.member.guild.id) {
            reconnectionList.splice(i, 1);
            break;
          }
        }
      }

      const voiceChannel = interaction.member?.voice.channel;
      utility.joinVoice(voiceChannel, voiceChannel, interaction.channelId);

      reconnectionList.push({
        id: voiceChannel.id,
        guild: {
          id: voiceChannel.guild.id,
        },
        ttsChannel: interaction.channelId,
      });

      utility.save_document(reconnectionList, "reconnection");

      interaction.reply({
        content: "Kef Voiced has joined the channel",
        ephemeral: false,
      });
    },

    leave: () => {
      if (idx != null) {
        interaction.reply({
          content: "Goodbye!",
          ephemeral: false,
        });

        activeConnections[idx].connection.destroy();
        activeConnections.splice(idx, 1);

        for (let i = 0; i < reconnectionList.length; i++) {
          if (reconnectionList[i].guild.id === interaction.member.guild.id) {
            reconnectionList.splice(i, 1);
            utility.save_document(reconnectionList, "reconnection");
            break;
          }
        }
      } else {
        interaction.reply({
          content: "Not currently connected to voice",
          ephemeral: true,
        });
      }
    },

    listvoices: () => {
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
    },

    setvoice: () => {
      let choice = interaction.options.getString('input').capitalize();

      polly.describeVoices( { LanguageCode: 'en-US'}, async function (err, data) {
        if (err) {
          console.log(err, err.stack);
        } else {
          let validChoice =  data.Voices.find(voice => voice.Name === choice);
          if (choice === 'Kevin') validChoice = false;

          if (validChoice) {
            let cached = false;
            let query = await utility.load_document(userId);

            if (query) {
              query.global.voice = choice;
              cachedUserMap.set(userId, query);
              utility.save_document(query, userId);
            } else {
              let newSetting = utility.makeDefaultSettings(userId);
              newSetting.global.voice = choice;
              cachedUserMap.set(userId, newSetting);
              utility.save_document(newSetting, userId);
            }
            interaction.reply({
              content: `Setting your voice to ${choice}`,
              ephemeral: true
            })

          } else interaction.reply({
            content: `${choice} is not a supported voice. Use /listvoices to see a full list of supported voices.`,
            ephemeral: true
          })
        }
      })
    },

    skip: () => {
      try {
        activeConnections[idx].playing = false;
        if (activeConnections[idx].queue.length != 0) {
          if (activeConnections[idx].queue[0].soundboard === false) {
            fs.unlinkSync(activeConnections[idx].queue[0].path);
            activeConnections[idx].queue.shift();
          }
        }

      } catch (err) {
        console.log(err);
      }
    }

  };

  // search the function key for the appropriate command and execute it
  const runInteraction = (interaction) => {
    utility.switchFn(slashCommands, interaction.commandName)();
  };

  runInteraction(interaction);
});

client.on("messageCreate", async (message) => {
  // useful data

  let userId = message.member.id;
  let voice = "Joey"; //default value to be replaced by cached data if available

  // determine if/where a matching active connection is stored
  let idx = null;

  for (let i = 0; i < activeConnections.length; i++) {
    if (activeConnections[i].guildId === message.channel.guild.id) {
      idx = i;
      break;
    }
  }

  // bot is either not in voice or ttsChannel doesn't match message channel
  if (idx === null || activeConnections[idx].ttsChannel != message.channelId) {
    return;
  }

  // Check to see if a message was ephemeral - skip if true
  if (message.flags.has("EPHEMERAL")) {
    return;
  }

  // Check to see if user has a cached voice setting
  if (cachedUserMap.has(userId)) {
    voice = cachedUserMap.get(userId).global.voice;
  } else {
    const query = await utility.load_document(userId);
    if (query) {
      cachedUserMap.set(userId, query);
      voice = cachedUserMap.get(userId).global.voice;
    } else cachedUserMap.set(userId, utility.makeDefaultSettings(userId));
  }

  // filter and modify message before it's sent to Polly //

  // define who spoke last
  let author = message.member.nickname ? message.member.nickname : message.author.username;

  // if last speaker matches current speaker, no need to inform who's speaking again
  if (activeConnections[idx].lastSpeaker !== author) {
    message.content = author + " said " + message.content;
    activeConnections[idx].lastSpeaker = author;
  }

  // filter message for links // TODO regex the link so any additional text is still read by polly
  if (message.content.search("http") != -1) {
    message.content = author + " sent a link.";
  }

  // filter discord tags to read user name instead of full tag
  message.mentions.users.forEach((value, key) => {
    const needle = `<@!${key}>`;
    const needle_alt = `<@${key}>`;
    const replace = ` at ${value.username} `;
    message.content = message.content.replaceAll(needle, replace);
    message.content = message.content.replaceAll(needle_alt, replace);
  });

  // filter custom emojis to emoji name
  if (message.content.match(/<:[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<:[A-Za-z0-9]{1,64}:\d{1,64}>/g);
    custemoji.forEach((emoji) => {
      const emojiname = emoji.split(":");
      message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
    });
  }

  // filter animated emojis to emoji name with fpstag
  if (message.content.match(/<a:[0-9]{1,3}fps_[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(
      /<a:[0-9]{1,3}fps_[A-Za-z0-9_]{1,64}:\d{1,64}>/g
    );
    custemoji.forEach((emoji) => {
      let emojiname = emoji.split(":");
      emojiname = emojiname[1].slice(emojiname[1].indexOf("_") + 1);
      message.content = message.content.replaceAll(emoji, ` ${emojiname} `);
    });
  }

  // filter animated emojis to emoji name without fpstag
  if (message.content.match(/<a:[A-Za-z0-9_]{1,64}:\d{1,64}>/g)) {
    const custemoji = message.content.match(/<a:[A-Za-z0-9_]{1,64}:\d{1,64}>/g);
    custemoji.forEach((emoji) => {
      let emojiname = emoji.split(":");
      message.content = message.content.replaceAll(emoji, ` ${emojiname[1]} `);
    });
  }

  // filter for messages that only contain an image
  if (
    message.content === "" &&
    message.attachments.first().contentType.includes("image/")
  ) {
    message.content = author + " sent an image.";
  }

  // send the message to the Polly API
  const params = {
    OutputFormat: "ogg_vorbis",
    Text: message.content,
    VoiceId: voice,
    SampleRate: "24000",
  };

  polly.synthesizeSpeech(params, function (err, data) {
    if (err) {
      console.log(err);
    } else {
      const fileLoc = "audio/" + message.id + ".ogg";
      fs.writeFile(fileLoc, data.AudioStream, (err) => {
        if (err) {
          console.log(err);
          return;
        } else {
          activeConnections[idx].queue.push({
            id: message.guildId,
            path: fileLoc,
            message: message.content,
            soundboard: false,
          });
        }
      });
    }
  });
});
