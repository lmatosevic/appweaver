import { logs, SeverityNumber } from '@opentelemetry/api';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor
} from '@opentelemetry/sdk-logs';
import { createLogBridge } from '../log-bridge';

describe('log-bridge', () => {
  let exporter: InMemoryLogRecordExporter;
  let provider: LoggerProvider;

  const emit = (record: object | string) => {
    createLogBridge().write(
      typeof record === 'string' ? record : JSON.stringify(record)
    );
    return exporter.getFinishedLogRecords().at(-1);
  };

  beforeEach(() => {
    exporter = new InMemoryLogRecordExporter();
    provider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor({ exporter })]
    });
    logs.setGlobalLoggerProvider(provider);
  });

  afterEach(async () => {
    logs.disable();
    await provider.shutdown();
  });

  test('emits a record with its message, severity, time and logger name', () => {
    const record = emit({
      level: 40,
      time: '2026-11-10T10:00:00.000Z',
      pid: 1,
      hostname: 'vm',
      module: 'billing',
      msg: 'Invoice overdue',
      invoiceId: 7,
      paid: false
    });

    expect(record?.body).toBe('Invoice overdue');
    expect(record?.severityNumber).toBe(SeverityNumber.WARN);
    expect(record?.severityText).toBe('WARN');
    expect(record?.hrTime[0]).toBe(
      Date.parse('2026-11-10T10:00:00.000Z') / 1000
    );
    expect(record?.attributes).toEqual({
      'appweaver.logger': 'billing',
      invoiceId: 7,
      paid: false
    });
  });

  test.each([
    [10, SeverityNumber.TRACE],
    [20, SeverityNumber.DEBUG],
    [30, SeverityNumber.INFO],
    [50, SeverityNumber.ERROR],
    [60, SeverityNumber.FATAL]
  ])('maps the level %i to its severity', (level, severity) => {
    expect(emit({ level, msg: 'x' })?.severityNumber).toBe(severity);
  });

  test('keeps an unknown level as the severity text', () => {
    const record = emit({ level: 35, msg: 'custom' });

    expect(record?.severityNumber).toBe(SeverityNumber.UNSPECIFIED);
    expect(record?.severityText).toBe('35');
  });

  test('flattens the error of a record into the exception attributes', () => {
    const record = emit({
      level: 50,
      msg: 'Charge failed',
      err: {
        type: 'PaymentError',
        message: 'declined',
        stack: 'PaymentError: declined',
        code: 'PAYMENT_DECLINED'
      }
    });

    expect(record?.attributes).toEqual({
      'exception.type': 'PaymentError',
      'exception.message': 'declined',
      'exception.stacktrace': 'PaymentError: declined',
      'error.type': 'PAYMENT_DECLINED'
    });
  });

  test('flattens the nested fields and leaves out the ids of the span', () => {
    const record = emit({
      level: 30,
      trace_id: 'a'.repeat(32),
      span_id: 'b'.repeat(16),
      trace_flags: '01',
      order: { id: 1, customer: { name: 'Ana', tags: { vip: true } } },
      items: [1, 2],
      empty: null
    });

    expect(record?.body).toBeUndefined();
    expect(record?.attributes).toEqual({
      'order.id': 1,
      'order.customer.name': 'Ana',
      'order.customer.tags': '{"vip":true}',
      items: '[1,2]'
    });
  });

  test('ignores a line that is not a record', () => {
    expect(emit('not json')).toBeUndefined();
  });
});
