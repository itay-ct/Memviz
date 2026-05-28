import dgram from 'node:dgram';

function isRunLabelSegment(segment) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    segment,
  );
}

export function parseStatsdLine(line) {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return null;
  }

  const separatorIndex = trimmedLine.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  const metricPath = trimmedLine.slice(0, separatorIndex);
  const payload = trimmedLine.slice(separatorIndex + 1).split('|');

  if (payload.length < 2) {
    return null;
  }

  const value = Number(payload[0]);
  if (!Number.isFinite(value)) {
    return null;
  }

  const segments = metricPath.split('.').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const runLabelIndex = segments.findIndex(isRunLabelSegment);
  if (runLabelIndex !== -1 && runLabelIndex < segments.length - 1) {
    return {
      prefix: segments.slice(0, runLabelIndex).join('.'),
      runLabel: segments[runLabelIndex],
      metric: segments.at(-1),
      value,
      type: payload[1],
      timestamp: new Date().toISOString(),
      raw: trimmedLine,
    };
  }

  return {
    prefix: segments.slice(0, -2).join('.'),
    runLabel: segments.at(-2),
    metric: segments.at(-1),
    value,
    type: payload[1],
    timestamp: new Date().toISOString(),
    raw: trimmedLine,
  };
}

export function createStatsdReceiver({
  host = '127.0.0.1',
  port = 8125,
  onMetric,
  onError,
}) {
  const socket = dgram.createSocket('udp4');

  socket.on('message', (buffer) => {
    const packet = buffer.toString('utf8');
    for (const line of packet.split(/\r?\n/)) {
      const parsed = parseStatsdLine(line);
      if (parsed) {
        onMetric(parsed);
      }
    }
  });

  socket.on('error', (error) => {
    if (onError) {
      onError(error);
    }
  });

  socket.bind(port, host);

  return socket;
}
