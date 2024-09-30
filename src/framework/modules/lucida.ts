import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import { sample } from '@antfu/utils';
import { BlobWriter, ZipWriter } from '@zip.js/zip.js';
import Lucida from 'lucida';
import Deezer from 'lucida/streamers/deezer/main.js';
import type { TrackGetByUrlResponse } from 'lucida/types';
import { parse } from 'node-html-parser';
import { join, resolve } from 'pathe';
import { match } from 'ts-pattern';
import { type Context, Embed } from '#framework';

type ScrapedARL = {
  plan: string;
  expiry: string;
  arl: string;
  country: string;
};

const storage = resolve(join('state/downloads'));

export class LucidaModule {
  private inited = false;
  private lucida!: Lucida;
  private arls: ScrapedARL[] = [];

  public async init() {
    if (this.inited) return;
    if (this.arls.length === 0) await this.populateARLs();
    this.lucida = new Lucida({
      modules: {
        deezer: new Deezer({
          arl: this.getRandomARL().arl
        })
      }
    });
    // TODO: filter out expired ARLs
    this.inited = true;
    return;
  }

  public async populateARLs() {
    const response = await fetch('https://rentry.org/firehawk52');
    const text = await response.text();

    const html = parse(text);

    const rows = html!
      .querySelectorAll('.ntable-wrapper')[1]!
      .querySelector('tbody')!
      .querySelectorAll('tr');

    for (const row of rows) {
      const tdElements = row.querySelectorAll('td')!;
      const country = tdElements[0].querySelector('img')!.getAttribute('alt')!;
      const plan = tdElements[1].text;
      const expiry = tdElements[2].text;
      const arl = tdElements[3].text;

      this.arls.push({ plan, expiry, arl, country });
    }

    return true;
  }

  public getRandomARL() {
    return sample<ScrapedARL>(this.arls, 1)[0];
  }

  public async search(query: string, kind: 'album' | 'track', limit: number) {
    if (!this.inited) await this.init();

    const _query = await this.lucida.search(query, limit);
    const _results = Object.values(_query)
      .map((a) => [...a.albums, ...a.artists.map((b) => b.albums ?? []).flat()])
      .flat()
      .filter(async (a) => (await this.lucida.getTypeFromUrl(a.url)) === kind)
      .map((a) => ({ [a.title]: a }))
      .reduce((acc, curr) => {
        return { ...acc, ...curr };
      }, {});

    if (!Object.values(_results).length)
      return 'No results found. Please try again with a different query.';

    const results = Object.values(_results)
      .map(
        (a, index) =>
          `${index}. [${a.artists![0].name} - ${a.title}](<${a.url}>)`
      )
      .join('\n')
      .trim();

    return results;
  }

  public async download(ctx: Context, url: string) {
    // startup
    if (!this.inited) await this.init();

    let res;

    try {
      res = await this.lucida.getByUrl(url);
    } catch (error: any) {
      // TODO: Handle this better
      if (error.message === 'ARL expired') {
        await this.init();
        res = await this.lucida.getByUrl(url);
      } else {
        return error as Error;
      }
    }

    return match(res)
      .with({ type: 'track' }, async (track) => {
        const embed = new Embed()
          .setTitle(track.metadata.title)
          .setURL(track.metadata.url)
          .setThumbnail(track.metadata.coverArtwork![0].url)
          .setAuthor({
            name: ctx.user.globalName ?? ctx.user.username,
            iconURL: ctx.user.avatarURL()
          })
          .setFooter({
            text: track.metadata.artists[0].name,
            iconURL: track.metadata.artists[0].url
          });
        await ctx.interaction.editOriginal({ embeds: [embed] });

        const fileSize = await this.downloadTrack(track);

        const description = `Finished downloading: ${track.metadata.artists[0].name} -  ${track.metadata.title}. (${fileSize})`;

        return await ctx.interaction.editOriginal({
          embeds: [embed.setDescription(description)]
        });
      })
      .with({ type: 'album' }, async (album) => {
        // There are multiple tracks in the album, so we need to download each one.
        const embed = new Embed()
          .setTitle(album.metadata.title)
          .setURL(album.metadata.url)
          .setThumbnail(album.metadata.coverArtwork![0].url)
          .setAuthor({
            name: ctx.user.globalName ?? ctx.user.username,
            iconURL: ctx.user.avatarURL()
          })
          .setFooter({
            text: album.metadata.artists![0].name,
            iconURL: album.metadata.artists![0].url
          });
        await ctx.interaction.editOriginal({ embeds: [embed] });

        // TODO: Abstract this
        const zipFileBlob = new BlobWriter();
        const zipWriter = new ZipWriter(zipFileBlob);
        // TODO: parallelly download all tracks
        for (const _track of album.tracks) {
          let track;

          try {
            track = await this.lucida.getByUrl(_track.url);
          } catch (error: any) {
            if (error.message === 'ARL expired') {
              await this.init();
              track = await this.lucida.getByUrl(_track.url);
            } else {
              return error as Error;
            }
          }
          track = track as TrackGetByUrlResponse;
          const { stream, mimeType } = await this.getStream(
            track as TrackGetByUrlResponse
          );
          const extension = mimeType.split('/')[1];

          await zipWriter.add(
            `${track.metadata.trackNumber} - ${track.metadata.title}.${extension}`,
            // @ts-expect-error kill yourself tsserver
            stream
          );
        }
        const blob = await zipWriter.close();
        // Convert the blob to a buffer and write it to a file
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Write the zip file to the current directory
        await fsp.writeFile(`${storage}/${album.metadata.title}.zip`, buffer);

        return await ctx.interaction.editOriginal({
          embeds: [
            embed.setDescription(
              `Finished downloading ${album.metadata.title}.`
            )
          ]
        });
      });
  }

  private async downloadTrack(track: TrackGetByUrlResponse) {
    const { stream, mimeType } = await this.getStream(track);
    const extension = mimeType.split('/')[1];

    const file = await fsp.open(
      `${storage}/${track.metadata.title}.${extension}`,
      'w'
    );

    const writable = file.createWriteStream();
    for await (const chunk of stream) writable.write(chunk);
    writable.end();

    return this.formatBytes((await file.stat()).size);
  }

  private formatBytes(_bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    let index = 0;

    let bytes = _bytes;
    while (bytes >= 1024 && index < units.length - 1) {
      bytes /= 1024;
      index++;
    }

    return `${bytes.toFixed(2)} ${units[index]}`;
  }

  private async getStream(track: TrackGetByUrlResponse) {
    if (track.type !== 'track') throw new Error('Not a track');
    if (!track.getStream) throw new Error('Track has no stream');
    const { stream, mimeType } = await track.getStream();

    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-thread_queue_size',
      '4096',
      // input:
      '-i',
      '-'
    ];

    const hasCover = track.metadata.album?.coverArtwork;

    if (hasCover) {
      const bestCover = hasCover.sort((a, b) => b.width - a.width)[0];
      args.push('-i', bestCover.url);
    }

    const extension = mimeType.split('/')[1];

    switch (extension) {
      case 'ogg':
        args.push('-c:a', 'copy', '-q:v', '10', '-preset', 'ultrafast');
        break;
      case 'flac':
        args.push('-disposition:v', 'attached_pic');
        break;
      default:
        args.push('-c:1', 'copy', '-b:a', '320k');
        break;
    }

    args.push('-map', '0:a', '-map', '1:0', '-id3v2_version', '3');

    if (hasCover) {
      args.push(
        '-metadata:s:v',
        'title="Album cover"',
        '-metadata:s:v',
        'comment="Cover (front)"'
      );
    }

    if (track.metadata.artists?.[0]?.name) {
      args.push('-metadata', `artist="${track.metadata.artists[0].name}"`);
    }
    if (track.metadata.album?.title) {
      args.push('-metadata', `album="${track.metadata.album.title}"`);
    }
    if (track.metadata.album?.artists?.[0]?.name) {
      args.push(
        '-metadata',
        `album_artist="${track.metadata.album.artists[0].name}"`
      );
    }
    if (track.metadata.discNumber) {
      args.push('-metadata', `disc="${track.metadata.discNumber}"`);
    }
    if (track.metadata.trackNumber) {
      args.push('-metadata', `track="${track.metadata.trackNumber}"`);
    }
    if (track.metadata.title) {
      args.push('-metadata', `title="${track.metadata.title}"`);
    }
    if (track.metadata.album?.releaseDate) {
      const year = track.metadata.album.releaseDate.getFullYear();
      const month = track.metadata.album.releaseDate.getMonth() + 1;
      const day = track.metadata.album.releaseDate.getDate();
      args.push(
        '-metadata',
        `date="${year.toString().padStart(4, '0')}-${month
          .toString()
          .padStart(2, '0')}-${day.toString().padStart(2, '0')}"`
      );
    }
    if (track.metadata.copyright) {
      args.push('-metadata', `copyright="${track.metadata.copyright}`);
    }
    if (track.metadata.composers?.[0]) {
      args.push('-metadata', `composer="${track.metadata.composers?.[0]}`);
    }
    if (track.metadata.producers) {
      args.push('-metadata', `producer="${track.metadata.producers?.[0]}`);
    }
    if (track.metadata.lyricists) {
      args.push('-metadata', `producer="${track.metadata.producers?.[0]}`);
    }
    if (track.metadata.explicit) args.push('-metadata', `rating="2"`);

    args.push('-f', extension);

    args.push('-');

    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stderr.on('data', (_data) => {
      // process.stderr.write(data); Don't care about its constant meandering
    });

    stream.pipe(ffmpeg.stdin);
    return {
      stream: Readable.toWeb(new Readable().wrap(ffmpeg.stdout)),
      mimeType
    };
  }
}
