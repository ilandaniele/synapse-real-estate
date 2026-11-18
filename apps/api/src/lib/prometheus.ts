/** Minimal Prometheus text exposition (format 0.0.4): counters, gauges and one histogram type. */

export const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export type Labels = Record<string, string | number>;

const escape = (value: string | number) => String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

const formatLabels = (labels: Labels) => {
  const pairs = Object.entries(labels).map(([key, value]) => `${key}="${escape(value)}"`);
  return pairs.length ? `{${pairs.join(",")}}` : "";
};

export interface Sample {
  labels?: Labels;
  value: number;
  suffix?: string;
}

/** One metric family: HELP and TYPE lines followed by its samples. */
export function family(name: string, type: "counter" | "gauge" | "histogram", help: string, samples: Sample[]): string {
  const lines = samples.map((s) => `${name}${s.suffix ?? ""}${formatLabels(s.labels ?? {})} ${s.value}`);
  return [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, ...lines].join("\n");
}

interface Series {
  labels: Labels;
  buckets: number[];
  sum: number;
  count: number;
}

/** Cumulative histogram keyed by label set. */
export class Histogram {
  private readonly series = new Map<string, Series>();

  constructor(
    readonly name: string,
    readonly help: string,
    private readonly bounds: number[],
  ) {}

  observe(labels: Labels, value: number) {
    const key = JSON.stringify(labels);
    const entry = this.series.get(key) ?? { labels, buckets: this.bounds.map(() => 0), sum: 0, count: 0 };
    this.bounds.forEach((bound, i) => {
      if (value <= bound) entry.buckets[i]! += 1;
    });
    entry.sum += value;
    entry.count += 1;
    this.series.set(key, entry);
  }

  render(): string {
    const samples = [...this.series.values()].flatMap(({ labels, buckets, sum, count }) => [
      ...this.bounds.map((bound, i) => ({ labels: { ...labels, le: bound }, value: buckets[i]!, suffix: "_bucket" })),
      { labels: { ...labels, le: "+Inf" }, value: count, suffix: "_bucket" },
      { labels, value: sum, suffix: "_sum" },
      { labels, value: count, suffix: "_count" },
    ]);
    return family(this.name, "histogram", this.help, samples);
  }
}

/** CPU, memory and uptime of this Node process. */
export function processMetrics(): string {
  const cpu = process.cpuUsage();
  const memory = process.memoryUsage();
  return [
    family("process_cpu_seconds_total", "counter", "User and system CPU time spent in seconds", [{ value: (cpu.user + cpu.system) / 1e6 }]),
    family("process_resident_memory_bytes", "gauge", "Resident memory size in bytes", [{ value: memory.rss }]),
    family("nodejs_heap_used_bytes", "gauge", "V8 heap used in bytes", [{ value: memory.heapUsed }]),
    family("process_uptime_seconds", "gauge", "Seconds since the process started", [{ value: process.uptime() }]),
  ].join("\n");
}
