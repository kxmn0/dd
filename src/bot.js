require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events,
} = require('discord.js');
const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const play = require('play-dl');

const token = process.env.DISCORD_TOKEN;
const prefix = process.env.PREFIX || '!';

if (!token) {
  throw new Error('DISCORD_TOKEN 환경 변수가 필요합니다. .env 파일을 확인하세요.');
}

/** @type {Map<string, {
 *   connection: import('@discordjs/voice').VoiceConnection,
 *   player: import('@discordjs/voice').AudioPlayer,
 *   queue: Array<{url: string, title: string, requestedBy: string}>,
 *   textChannelId: string,
 *   playing: boolean
 * }>} */
const guildStates = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`✅ 로그인 완료: ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const [command, ...rest] = message.content.slice(prefix.length).trim().split(/\s+/);
  const query = rest.join(' ').trim();

  try {
    switch (command?.toLowerCase()) {
      case 'play':
      case 'p':
        await handlePlay(message, query);
        break;
      case 'skip':
        await handleSkip(message);
        break;
      case 'stop':
        await handleStop(message);
        break;
      case 'queue':
      case 'q':
        await handleQueue(message);
        break;
      case 'help':
        await handleHelp(message);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(error);
    await message.reply('오류가 발생했어요. 로그를 확인해주세요.');
  }
});

async function handlePlay(message, query) {
  if (!query) {
    await message.reply('사용법: `!play <사운드클라우드 URL>`');
    return;
  }

  const validation = play.so_validate(query);
  if (validation !== 'track') {
    await message.reply('현재는 **SoundCloud 트랙 URL**만 재생할 수 있어요.');
    return;
  }

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    await message.reply('먼저 음성 채널에 들어가 주세요.');
    return;
  }

  const guildId = message.guild.id;
  let state = guildStates.get(guildId);

  if (!state) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    connection.subscribe(player);
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        connection.destroy();
        guildStates.delete(guildId);
      }
    });

    player.on(AudioPlayerStatus.Idle, async () => {
      if (!guildStates.has(guildId)) return;
      await playNext(guildId);
    });

    player.on('error', async (error) => {
      console.error('AudioPlayer 오류:', error.message);
      await playNext(guildId);
    });

    state = {
      connection,
      player,
      queue: [],
      textChannelId: message.channel.id,
      playing: false,
    };

    guildStates.set(guildId, state);
  }

  const info = await play.soundcloud(query);
  state.queue.push({
    url: query,
    title: info.name || query,
    requestedBy: message.author.tag,
  });

  await message.reply(`✅ 대기열에 추가: **${info.name || '알 수 없는 제목'}**`);

  if (!state.playing) {
    await playNext(guildId);
  }
}

async function playNext(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return;

  const next = state.queue.shift();
  if (!next) {
    state.playing = false;
    return;
  }

  state.playing = true;
  const stream = await play.stream(next.url, { discordPlayerCompatibility: true });
  const resource = createAudioResource(stream.stream, {
    inputType: stream.type || StreamType.Arbitrary,
    inlineVolume: false,
  });

  state.player.play(resource);

  const channel = await client.channels.fetch(state.textChannelId);
  if (channel?.isTextBased()) {
    await channel.send(`🎵 지금 재생 중: **${next.title}** (요청자: ${next.requestedBy})`);
  }
}

async function handleSkip(message) {
  const state = guildStates.get(message.guild.id);
  if (!state || !state.playing) {
    await message.reply('현재 재생 중인 노래가 없어요.');
    return;
  }

  state.player.stop(true);
  await message.reply('⏭️ 다음 곡으로 스킵합니다.');
}

async function handleStop(message) {
  const state = guildStates.get(message.guild.id);
  if (!state) {
    await message.reply('봇이 음성 채널에 연결되어 있지 않아요.');
    return;
  }

  state.queue.length = 0;
  state.player.stop(true);
  state.connection.destroy();
  guildStates.delete(message.guild.id);

  await message.reply('⏹️ 재생을 중지하고 채널에서 나갔어요.');
}

async function handleQueue(message) {
  const state = guildStates.get(message.guild.id);
  if (!state || state.queue.length === 0) {
    await message.reply('대기열이 비어 있어요.');
    return;
  }

  const lines = state.queue.slice(0, 10).map((item, index) => `${index + 1}. ${item.title}`);
  const embed = new EmbedBuilder()
    .setTitle('📜 현재 대기열')
    .setDescription(lines.join('\n'))
    .setColor(0xff5500);

  await message.reply({ embeds: [embed] });
}

async function handleHelp(message) {
  await message.reply([
    '**명령어 안내**',
    `\`${prefix}play <사운드클라우드 URL>\` : 곡 추가/재생`,
    `\`${prefix}skip\` : 현재 곡 스킵`,
    `\`${prefix}queue\` : 대기열 보기`,
    `\`${prefix}stop\` : 재생 종료 후 퇴장`,
  ].join('\n'));
}

client.login(token);
