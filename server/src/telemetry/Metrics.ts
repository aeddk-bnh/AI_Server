export interface MetricTags {
  [key: string]: string | number | boolean;
}

export interface MetricsRecorder {
  increment(name: string, value?: number, tags?: MetricTags): void;
  gauge(name: string, value: number, tags?: MetricTags): void;
  timing(name: string, valueMs: number, tags?: MetricTags): void;
}

export class NoopMetricsRecorder implements MetricsRecorder {
  increment(_name: string, _value = 1, _tags?: MetricTags): void {}

  gauge(_name: string, _value: number, _tags?: MetricTags): void {}

  timing(_name: string, _valueMs: number, _tags?: MetricTags): void {}
}
