import cors from 'cors';
import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import multer from 'multer';
import { createWriteStream } from 'node:fs';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const PORT = Number(process.env.CLEANUP_PORT ?? 3000);
const ARNNDN_MODEL_URL =
  process.env.ARNNDN_MODEL_URL ??
  'https://github.com/GregorR/rnnoise-models/raw/master/lq.rnnn';
const MODELS_DIR = path.resolve(process.cwd(), 'server/models');
const ARNNDN_MODEL_PATH = path.join(MODELS_DIR, 'lq.rnnn');

if (!ffmpegPath) {
  throw new Error(
    'ffmpeg-static não suportado nesta plataforma. Instale ffmpeg manualmente e defina o caminho via FFMPEG_PATH.',
  );
}

ffmpeg.setFfmpegPath(ffmpegPath);

type CleanupPreset = 'sherpa-onnx' | 'arnndn-lq' | 'deepfilternet';

type ResolvedPipeline = {
  filters: string[];
  label: string;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024 },
});

const app = express();
app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'audio-cleanup' });
});

app.post('/audio/cleanup', upload.single('audio'), async (req, res) => {
  const startedAt = performance.now();

  if (!req.file) {
    return res
      .status(400)
      .json({ error: 'Campo "audio" ausente no formulário multipart.' });
  }

  const preset = normalizePreset((req.body?.preset as string) ?? 'sherpa-onnx');
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cleanup-'));
  const inputPath = path.join(tmpDir, `input-${Date.now()}.webm`);
  const outputPath = path.join(tmpDir, `output-${Date.now()}.wav`);

  try {
    await writeFile(inputPath, req.file.buffer);
    const pipeline = await resolvePipeline(preset);
    await runFfmpegPipeline(inputPath, outputPath, pipeline.filters);
    const cleaned = await readFile(outputPath);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', cleaned.byteLength.toString());
    res.setHeader('X-Cleanup-Backend', pipeline.label);
    res.setHeader(
      'X-Processing-Time-Ms',
      Math.round(performance.now() - startedAt).toString(),
    );
    res.setHeader('X-SNR-Improvement-Db', '0');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Cleanup-Backend, X-Processing-Time-Ms, X-SNR-Improvement-Db',
    );

    return res.send(cleaned);
  } catch (error) {
    console.error('Audio cleanup error', error);
    return res.status(500).json({
      error: 'Falha ao processar áudio',
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

app.listen(PORT, () => {
  console.log(
    `🧼 Audio Cleanup dev server rodando em http://localhost:${PORT}/audio/cleanup`,
  );
  console.log('   Envie POST multipart com campo "audio" e preset opcional.');
});

function normalizePreset(value: string): CleanupPreset {
  if (value === 'arnndn-lq' || value === 'deepfilternet') {
    return value;
  }
  return 'sherpa-onnx';
}

async function resolvePipeline(
  preset: CleanupPreset,
): Promise<ResolvedPipeline> {
  if (preset === 'arnndn-lq') {
    const modelPath = await ensureArnndnModel();
    if (modelPath) {
      return {
        label: 'FFmpeg arnndn (lq.rnnn)',
        filters: [
          'highpass=f=80',
          `arnndn=m=${modelPath}:mix=0.85`,
          'loudnorm=I=-16:TP=-1.5:LRA=11',
        ],
      } satisfies ResolvedPipeline;
    }
    console.warn(
      'Modelo arnndn indisponível. Fazendo fallback para filtro afftdn.',
    );
  }

  if (preset === 'deepfilternet') {
    return {
      label: 'FFmpeg afftdn (DeepFilter fallback)',
      filters: [
        'highpass=f=60',
        'lowpass=f=16000',
        'afftdn=nr=18:nf=-30:tn=1:tr=1',
        'acompressor=threshold=0.03:ratio=4:attack=120:release=450',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
      ],
    } satisfies ResolvedPipeline;
  }

  return {
    label: 'FFmpeg afftdn (Sherpa mock)',
    filters: [
      'highpass=f=80',
      'lowpass=f=12000',
      'afftdn=nr=12:nf=-32:tn=1:tr=1',
      'acompressor=threshold=0.05:ratio=3:attack=180:release=800',
      'loudnorm=I=-16:TP=-1.5:LRA=11',
    ],
  } satisfies ResolvedPipeline;
}

function runFfmpegPipeline(
  inputPath: string,
  outputPath: string,
  filters: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(filters)
      .audioChannels(1)
      .audioFrequency(48_000)
      .audioCodec('pcm_s16le')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (error) => reject(error))
      .run();
  });
}

let arnndnModelPromise: Promise<string | null> | null = null;

function ensureArnndnModel(): Promise<string | null> {
  if (!arnndnModelPromise) {
    arnndnModelPromise = downloadArnndnModel();
  }
  return arnndnModelPromise;
}

async function downloadArnndnModel(): Promise<string | null> {
  try {
    await access(ARNNDN_MODEL_PATH);
    return ARNNDN_MODEL_PATH;
  } catch {
    console.info('Baixando modelo arnndn lq.rnnn para uso local...');
  }

  try {
    await mkdir(MODELS_DIR, { recursive: true });
    await downloadFile(ARNNDN_MODEL_URL, ARNNDN_MODEL_PATH);
    console.info('Modelo arnndn baixado com sucesso.');
    return ARNNDN_MODEL_PATH;
  } catch (error) {
    console.warn('Falha ao baixar modelo arnndn.', error);
    return null;
  }
}

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destination);

    https
      .get(url, (response) => {
        if (!response.statusCode || response.statusCode >= 400) {
          file.close();
          rm(destination, { force: true }).catch(() => undefined);
          reject(
            new Error(`Download falhou com status ${response.statusCode}`),
          );
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (error) => {
        file.close();
        rm(destination, { force: true }).catch(() => undefined);
        reject(error);
      });
  });
}
