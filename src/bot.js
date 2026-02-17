require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events,
  SlashCommandBuilder,
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

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('사운드클라우드 URL을 재생하거나 대기열에 추가합니다.')
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('사운드클라우드 트랙 URL (soundcloud.com / on.soundcloud.com)')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('skip').setDescription('현재 곡을 스킵합니다.'),
  new SlashCommandBuilder().setName('stop').setDescription('재생을 정지하고 퇴장합니다.'),
  new SlashCommandBuilder().setName('queue').setDescription('대기열을 표시합니다.'),
  new SlashCommandBuilder().setName('help').setDescription('사용 가능한 명령어를 보여줍니다.'),
].map((command) => command.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ 로그인 완료: ${client.user.tag}`);
  await client.application.commands.set(commands);
  console.log('✅ 슬래시 명령어 등록 완료');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;

  try {
    switch (interaction.commandName) {
      case 'play':
        await handlePlay(interaction);
        break;
      case 'skip':
        await handleSkip(interaction);
        break;
      case 'stop':
        await handleStop(interaction);
        break;
      case 'queue':
        await handleQueue(interaction);
        break;
      case 'help':
        await handleHelp(interaction);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: '오류가 발생했어요. 로그를 확인해주세요.', ephemeral: true });
      return;
    }

    await interaction.reply({ content: '오류가 발생했어요. 로그를 확인해주세요.', ephemeral: true });
  }
});

async function handlePlay(interaction) {
  const rawUrl = interaction.options.getString('url', true);
  await interaction.deferReply();

  const voiceChannel = interaction.member.voice.channel;
  if (!voiceChannel) {
    await interaction.editReply('먼저 음성 채널에 들어가 주세요.');
    return;
  }

  const resolvedUrl = await resolveSoundCloudTrackUrl(rawUrl);
  if (!resolvedUrl) {
    await interaction.editReply(
      '지원하지 않는 URL입니다. `soundcloud.com` 트랙 URL 또는 `on.soundcloud.com` 단축 URL을 사용해주세요.'
    );
    return;
  }

  const guildId = interaction.guild.id;
  let state = guildStates.get(guildId);

  if (!state) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
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
      textChannelId: interaction.channelId,
      playing: false,
    };

    guildStates.set(guildId, state);
  }

  const info = await play.soundcloud(resolvedUrl);
  state.queue.push({
    url: resolvedUrl,
    title: info.name || resolvedUrl,
    requestedBy: interaction.user.tag,
  });

  await interaction.editReply(`✅ 대기열에 추가: **${info.name || '알 수 없는 제목'}**`);

  if (!state.playing) {
    await playNext(guildId);
  }
}

async function resolveSoundCloudTrackUrl(input) {
  const cleaned = input.trim().replace(/^<|>$/g, '');

  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'on.soundcloud.com' || host.endsWith('.on.soundcloud.com')) {
    const redirected = await followRedirect(cleaned);
    if (!redirected) return null;
    return play.so_validate(redirected) === 'track' ? redirected : null;
  }

  if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) {
    return play.so_validate(cleaned) === 'track' ? cleaned : null;
  }

  return null;
}

async function followRedirect(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 DiscordMusicBot/1.0' },
    });

    return response.url;
  } catch (error) {
    console.error('URL 리다이렉트 해석 실패:', error.message);
    return null;
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

async function handleSkip(interaction) {
  const state = guildStates.get(interaction.guild.id);
  if (!state || !state.playing) {
    await interaction.reply({ content: '현재 재생 중인 노래가 없어요.', ephemeral: true });
    return;
  }

  state.player.stop(true);
  await interaction.reply('⏭️ 다음 곡으로 스킵합니다.');
}

async function handleStop(interaction) {
  const state = guildStates.get(interaction.guild.id);
  if (!state) {
    await interaction.reply({ content: '봇이 음성 채널에 연결되어 있지 않아요.', ephemeral: true });
    return;
  }

  state.queue.length = 0;
  state.player.stop(true);
  state.connection.destroy();
  guildStates.delete(interaction.guild.id);

  await interaction.reply('⏹️ 재생을 중지하고 채널에서 나갔어요.');
}

async function handleQueue(interaction) {
  const state = guildStates.get(interaction.guild.id);
  if (!state || state.queue.length === 0) {
    await interaction.reply({ content: '대기열이 비어 있어요.', ephemeral: true });
    return;
  }

  const lines = state.queue.slice(0, 10).map((item, index) => `${index + 1}. ${item.title}`);
  const embed = new EmbedBuilder()
    .setTitle('📜 현재 대기열')
    .setDescription(lines.join('\n'))
    .setColor(0xff5500);

  await interaction.reply({ embeds: [embed] });
}

async function handleHelp(interaction) {
  await interaction.reply([
    '**명령어 안내 (슬래시 명령어)**',
    '`/play url:<사운드클라우드 URL>` : 곡 추가/재생',
    '`/skip` : 현재 곡 스킵',
    '`/queue` : 대기열 보기',
    '`/stop` : 재생 종료 후 퇴장',
  ].join('\n'));
}

client.login(token);
