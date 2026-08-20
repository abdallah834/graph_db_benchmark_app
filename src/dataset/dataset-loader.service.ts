import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {
  EdgeRecord,
  LoadStats,
  NodeRecord,
} from '../drivers/graph-driver.interface';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const RESULTS_DIR = path.resolve(process.cwd(), 'results');

/**
 * SNAP email-Enron: who-emailed-whom network among Enron employees.
 * 36,692 nodes / 183,831 edges out of the box - comfortably inside the
 * assignment's 100k-500k relationship range, and small enough to fit
 * FalkorDB's 100MB free-tier cap (the tightest constraint across all five
 * platforms) with zero sampling required.
 *
 * Source: https://snap.stanford.edu/data/email-Enron.html
 */
const DATASET_URL = 'https://snap.stanford.edu/data/email-Enron.txt.gz';
const DATASET_ARCHIVE_CACHE_PATH = path.join(CACHE_DIR, 'email-Enron.txt.gz');
const PARSED_CACHE_PATH = path.join(CACHE_DIR, 'dataset.json');

// Defensive ceiling in case a different dataset is swapped in later -
// the assignment caps the useful range at ~500k relationships.
const MAX_RELATIONSHIPS = 500_000;

interface Dataset {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
}

@Injectable()
export class DatasetLoaderService {
  private readonly logger = new Logger(DatasetLoaderService.name);
  private cachedDataset: Dataset | null = null;

  async getDataset(): Promise<Dataset> {
    if (this.cachedDataset) return this.cachedDataset;

    try {
      const raw = await fs.readFile(PARSED_CACHE_PATH, 'utf-8');
      this.cachedDataset = JSON.parse(raw) as Dataset;
      this.logger.log(`Loaded cached parsed dataset from ${PARSED_CACHE_PATH}`);
      return this.cachedDataset;
    } catch {
      // no parsed cache yet - fall through to source load
    }

    const dataset = await this.loadFromSource();
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(PARSED_CACHE_PATH, JSON.stringify(dataset));
    this.cachedDataset = dataset;
    return dataset;
  }

  async sampleRandomNodeIds(count: number): Promise<string[]> {
    const { nodes } = await this.getDataset();
    return Array.from(
      { length: count },
      () => nodes[Math.floor(Math.random() * nodes.length)].id,
    );
  }

  async sampleRandomLabels(count: number): Promise<string[]> {
    const { nodes } = await this.getDataset();
    const labels = [...new Set(nodes.map((n) => n.label))];
    return Array.from(
      { length: count },
      () => labels[Math.floor(Math.random() * labels.length)],
    );
  }

  async persistLoadStats(platform: string, stats: LoadStats): Promise<void> {
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    const filePath = path.join(RESULTS_DIR, `${platform}.load.json`);
    await fs.writeFile(filePath, JSON.stringify(stats, null, 2));
  }

  private async loadFromSource(): Promise<Dataset> {
    const rawText = await this.downloadAndDecompress();
    const lines = rawText.split('\n');

    const nodeIds = new Set<string>();
    const edges: EdgeRecord[] = [];

    for (const line of lines) {
      // SNAP edge-list files start with '#'-prefixed header/comment lines.
      if (!line || line.startsWith('#')) continue;

      const [from, to] = line.trim().split(/\s+/);
      if (!from || !to) continue;

      nodeIds.add(from);
      nodeIds.add(to);
      edges.push({ from, to, type: 'EMAILED' });

      if (edges.length >= MAX_RELATIONSHIPS) break;
    }

    const nodes: NodeRecord[] = [...nodeIds].map((id) => ({
      id,
      label: 'Person',
      properties: {},
    }));

    this.logger.log(
      `Parsed SNAP email-Enron dataset: ${nodes.length} nodes, ${edges.length} relationships`,
    );

    return { nodes, edges };
  }

  private async downloadAndDecompress(): Promise<string> {
    await fs.mkdir(CACHE_DIR, { recursive: true });

    let compressed: Buffer;
    try {
      compressed = await fs.readFile(DATASET_ARCHIVE_CACHE_PATH);
      this.logger.log(`Using cached download at ${DATASET_ARCHIVE_CACHE_PATH}`);
    } catch {
      this.logger.log(`Downloading dataset from ${DATASET_URL} ...`);
      const response = await fetch(DATASET_URL);
      if (!response.ok) {
        throw new Error(
          `Failed to download dataset: ${response.status} ${response.statusText}. ` +
            'If this environment blocks outbound requests to snap.stanford.edu, ' +
            `download email-Enron.txt.gz manually and place it at ${DATASET_ARCHIVE_CACHE_PATH}.`,
        );
      }
      compressed = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(DATASET_ARCHIVE_CACHE_PATH, compressed);
    }

    return zlib.gunzipSync(compressed).toString('utf-8');
  }
}
