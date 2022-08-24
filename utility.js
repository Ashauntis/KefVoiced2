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
} = require('@discordjs/voice');
const aws = require('aws-sdk');
const fs = require('fs');
const { join } = require("path");

// data tracking
let activeConnections = [];
let reconnectionList = [];

// Define our connection class

class VoiceConnection {
  constructor() {
    this.player = createAudioPlayer();
    this.connection = null;
    this.queue = [];
    this.playing = false;
    this.lastSpeaker = null;

    this.player.on((AudioPlayerStatus.Idle || AudioPlayerStatus.Paused), () => {
      try {
        this.playing = false;
        if (this.queue.length != 0) {
          if (this.queue[0].soundboard === false) {
            fs.unlinkSync(this.queue[0].path);
          }
          this.queue.shift();
        }

      } catch (err) {
        console.log(err);
      }
    })
  }
}

// Utility functions

aws.config.getCredentials(function(err) {
  if (err) {
    console.log(err.stack);
  } else {
    console.log('Successfully logged into AWS');
  }
});

const dynamo = new aws.DynamoDB({
  apiVersion: '2012-08-10',
  region: 'us-east-1',
});

const polly = new aws.Polly({ apiVersion: '2016-06-10', region: 'us-east-1' });

function makeEmptyCacheEntry(userID) {
  return {
      [userID]: {
      },
  };
}

function makeDefaultSettings(userID) {
  return {
      global: {
        voice: "Joey",
      }
  };
}

async function load_document(id) {
  // set result_data to null to start
  let result_data = null;

  // specify the parameters for the getItem call
  const params = {
    TableName: 'kef_voiced_settings',
    Key: {
      id: { S: id },
    },
  };

  // get the document from Amazon DynamoDB
  await dynamo.getItem(params, function(err, data) {
      if (err) {
        console.log(err, err.stack);
      } else if (Object.keys(data).length == 0) {
      } else {
        // console.dir(data);
        result_data = JSON.parse(data.Item.value.S);
      }
    });

  if (result_data == null) {
    console.log(`Document not found: ${id}`);
  } else {
    console.log(`Successfully loaded document: ${id} `);
  }

  return result_data;
}

async function save_document(data_object, id) {
  // create a new document from a stringified object
  const value = JSON.stringify(data_object);

  // specify the parameters for the putItem call
  const params = {
    TableName: 'kef_voiced_settings',
    Item: {
      id: { S: id },
      value: { S: value },
    },
  };

  // store the document in Amazon DynamoDB
  const r = await dynamo
    .putItem(params, function(err) {
      if (err) {
        console.log('Error', err, err.stack);
      } else {
        console.log(`Document added. ID: ${id}, Data:`);
        console.dir(data_object);
      }
    });

  return r;
}

const switchFn =
  (lookupObject, defaultCase = '_default') =>
  (expression) =>
    (lookupObject[expression] || lookupObject[defaultCase])();

async function joinVoice(connection, channel, ttsChannel ) {

  activeConnections.push(new VoiceConnection());
  const i = activeConnections.length - 1;

  activeConnections[i].connection = await joinVoiceChannel({
    channelId: connection.id,
    guildId: connection.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  activeConnections[i].connection.subscribe(activeConnections[i].player);

  activeConnections[i].channelId = connection.id;
  activeConnections[i].guildId = connection.guild.id;
  activeConnections[i].soundboard = [];
  activeConnections[i].ttsChannel = ttsChannel;

};

async function reconnectVoice() {
  try {
    reconnectionList = await utility.load_document('reconnection');

    // Guarantee reconnectionList is an array, otherwise revert it to an empty array
    if (!Array.isArray(reconnectionList)) {
      reconnectionList = [];
      return;
    }

    if (reconnectionList.length > 0) {
      reconnectionList.forEach(async (connection) => {
        const channel = client.channels.cache.get(connection.id);
        if (!channel) return console.error('The channel does not exist!');
        joinVoice(connection, channel, connection.ttsChannel);
      });
    }
  } catch (error) {
    console.error(error);
  }
}

function playQueue() {

  activeConnections.forEach((connection) => {
    if (connection.queue.length != 0 && !connection.playing) {
      // if the player is not playing, play the next audiofile
      try {
        // check if audio file exists
        if (fs.existsSync(connection.queue[0].path)) {
          connection.playing = true;
          connection.connection = getVoiceConnection(connection.queue[0].id);
          const audioClip = createAudioResource(
            fs.createReadStream(
              join(__dirname, connection.queue[0].path),
              {
                inputType: StreamType.OggOpus,
              }
            )
          );
          connection.player.play(audioClip);
        } else {
          throw new Error('File does not exist!');
        }
      } catch (e) {
        console.log('Error playing file');
        console.error(e);
      }
    } else {
      console.log('queue is empty or currently playing');
      console.log('player state = ' + connection.player._state.status + ', connection.playing=' + connection.playing);

    }
  });
}


module.exports = {
    switchFn,
    joinVoice,
    reconnectVoice,
    makeEmptyCacheEntry,
    makeDefaultSettings,
    save_document,
    load_document,
    playQueue,
    activeConnections,
    reconnectionList,
    polly,
};