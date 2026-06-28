import { DeploymentLogEmitter } from './deployment-log-emitter.service';
import type { DeploymentEventsPublisher } from '../events/deployment-events.publisher';

describe('DeploymentLogEmitter', () => {
  function build() {
    const emitLog = jest.fn();
    const emitter = new DeploymentLogEmitter({
      emitLog,
    } as unknown as DeploymentEventsPublisher);
    return { emitter, emitLog };
  }

  it('splits a multi-line message into one event per non-empty trimmed line', () => {
    const { emitter, emitLog } = build();
    emitter.emit('d1', '  line one  \n\n line two \n', 'info');
    expect(emitLog).toHaveBeenCalledTimes(2);
    expect(emitLog.mock.calls[0][0]).toMatchObject({
      deploymentId: 'd1',
      message: 'line one',
    });
  });

  it('infers error level from the content regardless of the fallback', () => {
    const { emitter, emitLog } = build();
    emitter.emit('d1', 'Build failed: boom', 'info');
    expect(emitLog.mock.calls[0][0].level).toBe('error');
  });

  it('infers success level from the content', () => {
    const { emitter, emitLog } = build();
    emitter.emit('d1', 'Deployment completed', 'info');
    expect(emitLog.mock.calls[0][0].level).toBe('success');
  });

  it('falls back to the provided level for neutral lines', () => {
    const { emitter, emitLog } = build();
    emitter.emit('d1', 'pulling image foo', 'info');
    expect(emitLog.mock.calls[0][0].level).toBe('info');
  });
});
